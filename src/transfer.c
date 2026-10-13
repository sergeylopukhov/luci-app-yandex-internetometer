/* Native measurement engine (plain HTTP).
 *
 * One process, one poll() loop, persistent HTTP/1.1 connections, fixed buffers:
 *  - download: keep-alive GET loops; bytes are counted as they arrive inside the
 *    measurement window (after warm-up, before the deadline);
 *  - upload: keep-alive POSTs with a fixed Content-Length, sent straight from one
 *    static zero buffer; the result uses only bytes reported by the server's own
 *    counter (statsUrl, SSE "u" events), over exactly `seconds` of server time.
 * HTTPS measurements are done by the portable curl engine, which keeps TLS checks.
 *
 * usage: transfer-native download|upload seconds streams bytes urls-file sample-file
 *        transfer-native --probe
 * urls-file: download lines are URLs; upload lines are "postUrl<TAB>statsUrl".
 */
#define _POSIX_C_SOURCE 200809L
#define _DEFAULT_SOURCE
#define _DARWIN_C_SOURCE
#include <errno.h>
#include <fcntl.h>
#include <netdb.h>
#include <netinet/in.h>
#include <poll.h>
#include <signal.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <strings.h>
#include <sys/socket.h>
#include <sys/types.h>
#include <time.h>
#include <unistd.h>
#ifdef __linux__
#include <sys/prctl.h>
#endif
#ifndef MSG_NOSIGNAL
#define MSG_NOSIGNAL 0
#endif

#define MAX_STREAMS 12
#define MAX_URLS 32
#define URL_MAX 2048
#define IO_CHUNK 65536
#define WARMUP 1.0        /* seconds excluded from the result (TCP ramp-up) */
#define GRACE 3.0         /* extra time for the server counter to cover the window */
#define MAX_FAILURES 3    /* failed requests tolerated per connection */
#define RETRY_DELAY 0.25

static const char zeros[IO_CHUNK];   /* every upload send() reads from here */
static char scratch[IO_CHUNK];       /* single receive buffer shared by all sockets */
static volatile sig_atomic_t stopped;

enum kind { DL, UP, STATS };
enum state { IDLE, CONNECTING, SENDING, RECEIVING };
enum chunk { CS_SIZE, CS_EXT, CS_DATA, CS_DATA_END, CS_TRAILER };

struct url {
    char text[URL_MAX], host[256], port[8], path[URL_MAX];
    struct sockaddr_storage addr; socklen_t addrlen;
};

struct probe {
    struct url post, stats;
    struct conn *counter;
    long long win_start, last_t, win_bytes, events;
    int window_done;
    char line[512]; size_t line_len; int line_overflow;
};

struct conn {
    enum kind kind; enum state state; int fd;
    struct url *url; struct probe *probe;
    char req[URL_MAX + 512]; size_t req_len, req_off;
    long long body_left;
    char hdr[4096]; size_t hdr_len; int in_body, status, chunked, close_after;
    long long content_left;
    enum chunk cs; long long chunk_left; size_t trailer_line;
    int failures; double retry_at;
};

static double t_start, t_warm, t_deadline;
static long long window_ms, upload_size;
static int fatal, connects, responses, errors;
static long long dl_window_bytes;

static double now(void) { struct timespec t; clock_gettime(CLOCK_MONOTONIC, &t); return t.tv_sec + t.tv_nsec / 1e9; }
static void stop_signal(int sig) { (void)sig; stopped = 1; }

static const char *find(const char *s, size_t len, const char *needle) {
    size_t n = strlen(needle);
    for (size_t i = 0; n <= len && i <= len - n; i++) if (!memcmp(s + i, needle, n)) return s + i;
    return NULL;
}
static long long json_int(const char *s, size_t len, const char *key) {
    const char *p = find(s, len, key), *end = s + len; long long v = 0; int digits = 0;
    if (!p) return -1;
    for (p += strlen(key); p < end && *p >= '0' && *p <= '9'; p++, digits++) v = v * 10 + (*p - '0');
    return digits ? v : -1;
}

static int parse_url(const char *text, struct url *u) {
    const char *h, *slash, *colon; size_t hl;
    if (strlen(text) >= URL_MAX || strncmp(text, "http://", 7)) return -1;
    strcpy(u->text, text); h = text + 7;
    slash = strchr(h, '/'); if (!slash) return -1;
    colon = memchr(h, ':', (size_t)(slash - h));
    hl = (size_t)((colon ? colon : slash) - h);
    if (!hl || hl >= sizeof(u->host)) return -1;
    memcpy(u->host, h, hl); u->host[hl] = 0;
    if (colon) {
        size_t pl = (size_t)(slash - colon - 1);
        if (!pl || pl >= sizeof(u->port)) return -1;
        memcpy(u->port, colon + 1, pl); u->port[pl] = 0;
    } else strcpy(u->port, "80");
    strcpy(u->path, slash);
    for (const char *c = u->text; *c; c++) if (*c <= ' ' || *c == 127) return -1;
    return 0;
}
static int resolve(struct url *u) {
    struct addrinfo hints = {0}, *res;
    hints.ai_family = AF_UNSPEC; hints.ai_socktype = SOCK_STREAM;
    if (getaddrinfo(u->host, u->port, &hints, &res) || !res) return -1;
    memcpy(&u->addr, res->ai_addr, res->ai_addrlen); u->addrlen = res->ai_addrlen;
    freeaddrinfo(res);
    return 0;
}

static void reset_response(struct conn *c) {
    c->hdr_len = 0; c->in_body = 0; c->status = 0; c->chunked = 0; c->close_after = 0;
    c->content_left = -1; c->cs = CS_SIZE; c->chunk_left = 0; c->trailer_line = 0;
}
static int queue_request(struct conn *c) {
    const char *ua = "User-Agent: Mozilla/5.0 (OpenWrt; Yandex Internetometer)\r\nReferer: https://yandex.ru/internet/\r\n";
    int n;
    if (c->kind == UP) {
        n = snprintf(c->req, sizeof(c->req), "POST %s HTTP/1.1\r\nHost: %s\r\n%sContent-Type: application/octet-stream\r\nContent-Length: %lld\r\nConnection: keep-alive\r\n\r\n",
                     c->url->path, c->url->host, ua, upload_size);
        c->body_left = upload_size;
    } else {
        n = snprintf(c->req, sizeof(c->req), "GET %s HTTP/1.1\r\nHost: %s\r\n%s%sConnection: keep-alive\r\n\r\n",
                     c->url->path, c->url->host, ua, c->kind == STATS ? "Accept: text/event-stream\r\nCache-Control: no-cache\r\n" : "");
        c->body_left = 0;
    }
    if (n < 0 || (size_t)n >= sizeof(c->req)) return -1;
    c->req_len = (size_t)n; c->req_off = 0; c->state = SENDING;
    reset_response(c);
    return 0;
}
static void close_conn(struct conn *c) { if (c->fd >= 0) close(c->fd); c->fd = -1; c->state = IDLE; }
static int open_conn(struct conn *c) {
    int fd = socket(c->url->addr.ss_family, SOCK_STREAM, 0);
    if (fd < 0) return -1;
#ifdef SO_NOSIGPIPE
    { int one = 1; setsockopt(fd, SOL_SOCKET, SO_NOSIGPIPE, &one, sizeof(one)); }
#endif
    fcntl(fd, F_SETFL, fcntl(fd, F_GETFL) | O_NONBLOCK);
    connects++;
    if (connect(fd, (struct sockaddr *)&c->url->addr, c->url->addrlen) && errno != EINPROGRESS) { close(fd); return -1; }
    c->fd = fd; c->state = CONNECTING;
    if (queue_request(c)) { close_conn(c); return -1; }
    c->state = CONNECTING;
    return 0;
}

/* A failed request: retry a few times, unless the server counter itself is lost. */
static void fail_conn(struct conn *c, const char *why) {
    double t = now();
    close_conn(c);
    if (c->kind == DL && t >= t_deadline) return;
    errors++;
    fprintf(stderr, "native: %s %s: %s\n", c->kind == STATS ? "counter" : c->kind == UP ? "upload" : "download", c->url->host, why);
    if (c->kind == STATS && c->probe->win_start) { fatal = 1; return; }
    if (++c->failures > MAX_FAILURES) { fatal = 1; return; }
    c->retry_at = t + RETRY_DELAY;
}

static void sse_line(struct probe *p, const char *s, size_t len, double t) {
    long long b, ts;
    if (len < 5 || memcmp(s, "data:", 5) || !find(s, len, "\"k\":\"u\"")) return;
    b = json_int(s, len, "\"b\":"); ts = json_int(s, len, "\"t\":");
    if (b < 0 || ts < 0 || (p->events && ts <= p->last_t)) return;
    p->events++; p->last_t = ts;
    if (!p->win_start) {
        /* The first tick after local warm-up opens the window; its bytes predate it. */
        if (t >= t_warm) p->win_start = ts;
        return;
    }
    if (ts <= p->win_start + window_ms) p->win_bytes += b;
    if (ts >= p->win_start + window_ms) p->window_done = 1;
}
static void sse_feed(struct probe *p, const char *s, size_t n, double t) {
    for (size_t i = 0; i < n; i++) {
        if (s[i] == '\n') {
            size_t len = p->line_len;
            if (len && p->line[len - 1] == '\r') len--;
            if (!p->line_overflow) sse_line(p, p->line, len, t);
            p->line_len = 0; p->line_overflow = 0;
        } else if (p->line_len < sizeof(p->line)) p->line[p->line_len++] = s[i];
        else p->line_overflow = 1;
    }
}
static void payload(struct conn *c, const char *s, size_t n, double t) {
    if (c->kind == DL) { if (t >= t_warm && t < t_deadline) dl_window_bytes += (long long)n; }
    else if (c->kind == STATS) sse_feed(c->probe, s, n, t);
    /* UP: the response body (e.g. "OK") is never counted. */
}

static void response_done(struct conn *c) {
    if (c->kind == STATS) { fail_conn(c, "counter stream ended"); return; }
    c->failures = 0;
    if (c->close_after || (c->kind == UP && c->body_left > 0)) { close_conn(c); c->retry_at = now(); return; }
    if (queue_request(c)) fail_conn(c, "request too long");
}

static int parse_headers(struct conn *c) {
    char *end = strstr(c->hdr, "\r\n\r\n"), *line, *next;
    if (!end) return 0;
    *end = 0;
    if (sscanf(c->hdr, "HTTP/1.%*d %d", &c->status) != 1) return -1;
    for (line = strstr(c->hdr, "\r\n"); line; line = next) {
        line += 2; next = strstr(line, "\r\n");
        if (next) *next = 0;
        if (!strncasecmp(line, "content-length:", 15)) c->content_left = atoll(line + 15);
        else if (!strncasecmp(line, "transfer-encoding:", 18) && strstr(line, "chunked")) c->chunked = 1;
        else if (!strncasecmp(line, "connection:", 11) && strstr(line, "close")) c->close_after = 1;
    }
    return (int)(end - c->hdr) + 4;
}

/* Feed received bytes: headers, then a Content-Length, chunked or until-close body. */
static void feed(struct conn *c, const char *s, size_t n, double t) {
    while (n > 0 && c->fd >= 0) {
        if (!c->in_body) {
            size_t room = sizeof(c->hdr) - 1 - c->hdr_len, k = n < room ? n : room, before = c->hdr_len;
            int used;
            memcpy(c->hdr + c->hdr_len, s, k); c->hdr_len += k; c->hdr[c->hdr_len] = 0;
            used = parse_headers(c);
            if (used < 0) { fail_conn(c, "bad response"); return; }
            if (!used) { if (c->hdr_len >= sizeof(c->hdr) - 1) fail_conn(c, "headers too long"); return; }
            if (c->status < 200 || c->status > 299) {
                char why[32]; snprintf(why, sizeof(why), "HTTP %d", c->status); fail_conn(c, why); return;
            }
            responses++;
            c->in_body = 1;
            s += (size_t)used - before; n -= (size_t)used - before;
            if (!c->chunked && c->content_left == 0) { response_done(c); return; }
            continue;
        }
        if (c->chunked) {
            char ch = *s;
            switch (c->cs) {
            case CS_SIZE:
                if ((ch >= '0' && ch <= '9') || (ch >= 'a' && ch <= 'f') || (ch >= 'A' && ch <= 'F'))
                    c->chunk_left = c->chunk_left * 16 + (ch <= '9' ? ch - '0' : (ch | 32) - 'a' + 10);
                else if (ch == '\n') c->cs = c->chunk_left ? CS_DATA : CS_TRAILER;
                else c->cs = CS_EXT;
                s++; n--; break;
            case CS_EXT:
                if (ch == '\n') c->cs = c->chunk_left ? CS_DATA : CS_TRAILER;
                s++; n--; break;
            case CS_DATA: {
                size_t k = (long long)n < c->chunk_left ? n : (size_t)c->chunk_left;
                payload(c, s, k, t); s += k; n -= k; c->chunk_left -= (long long)k;
                if (!c->chunk_left) c->cs = CS_DATA_END;
                break; }
            case CS_DATA_END:
                if (ch == '\n') c->cs = CS_SIZE;
                s++; n--; break;
            case CS_TRAILER:
                s++; n--;
                if (ch == '\n') { if (c->trailer_line == 0) { response_done(c); return; } c->trailer_line = 0; }
                else if (ch != '\r') c->trailer_line++;
                break;
            }
        } else if (c->content_left >= 0) {
            size_t k = (long long)n < c->content_left ? n : (size_t)c->content_left;
            payload(c, s, k, t); s += k; n -= k; c->content_left -= (long long)k;
            if (!c->content_left) { response_done(c); return; }
        } else { payload(c, s, n, t); return; }
    }
}

static void on_writable(struct conn *c) {
    if (c->state == CONNECTING) {
        int err = 0; socklen_t len = sizeof(err);
        if (getsockopt(c->fd, SOL_SOCKET, SO_ERROR, &err, &len) || err) { fail_conn(c, "connect failed"); return; }
        c->state = SENDING;
    }
    while (c->state == SENDING) {
        const char *p; size_t k; ssize_t w;
        if (c->req_off < c->req_len) { p = c->req + c->req_off; k = c->req_len - c->req_off; }
        else if (c->body_left > 0) { p = zeros; k = c->body_left < IO_CHUNK ? (size_t)c->body_left : IO_CHUNK; }
        else { c->state = RECEIVING; break; }
        w = send(c->fd, p, k, MSG_NOSIGNAL);
        if (w < 0) { if (errno != EAGAIN && errno != EWOULDBLOCK && errno != EINTR) fail_conn(c, "send failed"); return; }
        if (c->req_off < c->req_len) c->req_off += (size_t)w; else c->body_left -= w;
        if ((size_t)w < k) return;
    }
}
static void on_readable(struct conn *c) {
    ssize_t r = recv(c->fd, scratch, sizeof(scratch), 0);
    if (r > 0) { feed(c, scratch, (size_t)r, now()); return; }
    if (r < 0 && (errno == EAGAIN || errno == EWOULDBLOCK || errno == EINTR)) return;
    /* Peer closed: a body delimited by close is complete, anything else failed. */
    if (r == 0 && c->in_body && !c->chunked && c->content_left < 0 && c->kind != STATS) { response_done(c); close_conn(c); c->retry_at = now(); return; }
    fail_conn(c, r == 0 ? "connection closed" : "receive failed");
}

static int write_sample(const char *path, double current, double average, double elapsed, int final) {
    char tmp[4096]; FILE *f;
    if (snprintf(tmp, sizeof(tmp), "%s.tmp", path) >= (int)sizeof(tmp)) return -1;
    if (!(f = fopen(tmp, "w"))) return -1;
    fprintf(f, "{\"current_mbps\":%.2f,\"average_mbps\":%.2f,\"elapsed\":%.3f,\"responses\":%d,\"errors\":%d,\"connections\":%d,\"final\":%s}\n",
            current, average, elapsed, responses, errors, connects, final ? "true" : "false");
    if (fclose(f)) return -1;
    return rename(tmp, path);
}
static long peak_rss_kb(void) {
    long kb = -1; char line[256]; FILE *f = fopen("/proc/self/status", "r");
    if (!f) return -1;
    while (fgets(line, sizeof(line), f)) if (!strncmp(line, "VmHWM:", 6)) kb = atol(line + 6);
    fclose(f);
    return kb;
}
static long integer(const char *s, long lo, long hi) {
    char *end; long n = strtol(s, &end, 10);
    if (!*s || *end || n < lo || n > hi) return -1;
    return n;
}

/* Upload rate: server bytes over the server-time span each counter covered. */
static double upload_mbps(struct probe *probes, int n) {
    double sum = 0;
    for (int i = 0; i < n; i++) {
        long long span = probes[i].last_t - probes[i].win_start;
        if (!probes[i].win_start || span <= 0) continue;
        if (span > window_ms) span = window_ms;
        sum += probes[i].win_bytes * 8.0 / (span / 1000.0) / 1e6;
    }
    return sum;
}
static long long upload_bytes(struct probe *probes, int n) {
    long long sum = 0;
    for (int i = 0; i < n; i++) sum += probes[i].win_bytes;
    return sum;
}

int main(int argc, char **argv) {
    static struct url dl_urls[MAX_URLS];
    static struct probe probes[MAX_URLS];
    static struct conn conns[MAX_STREAMS + MAX_URLS];
    struct pollfd pfd[MAX_STREAMS + MAX_URLS];
    int uploading, nurls = 0, nconns = 0, nprobes;
    long duration, count;
    char line[2 * URL_MAX + 2];
    FILE *f;

    if (argc == 2 && !strcmp(argv[1], "--probe")) { puts("native-http-1"); return 0; }
    if (argc != 7 || (strcmp(argv[1], "download") && strcmp(argv[1], "upload"))) {
        fprintf(stderr, "usage: transfer-native download|upload seconds streams bytes urls-file sample-file\n"); return 2;
    }
    uploading = !strcmp(argv[1], "upload");
    duration = integer(argv[2], 1, 60); count = integer(argv[3], 1, MAX_STREAMS);
    upload_size = integer(argv[4], 1024, 200000000);
    if (duration < 0 || count < 0 || upload_size < 0) return 2;
    if (!(f = fopen(argv[5], "r"))) return 2;
    while (nurls < MAX_URLS && fgets(line, sizeof(line), f)) {
        char *tab;
        line[strcspn(line, "\r\n")] = 0;
        if (!*line) continue;
        tab = strchr(line, '\t');
        if (uploading) {
            if (!tab) { fclose(f); return 2; }
            *tab = 0;
            if (parse_url(line, &probes[nurls].post) || parse_url(tab + 1, &probes[nurls].stats)) { fclose(f); return 2; }
        } else if (tab || parse_url(line, &dl_urls[nurls])) { fclose(f); return 2; }
        nurls++;
    }
    fclose(f);
    if (!nurls) return 2;
    nprobes = nurls;

    signal(SIGPIPE, SIG_IGN); signal(SIGTERM, stop_signal); signal(SIGINT, stop_signal);
#ifdef __linux__
    { pid_t parent = getppid(); if (parent == 1 || prctl(PR_SET_PDEATHSIG, SIGTERM) || getppid() != parent) return 130; }
#endif
    for (int i = 0; i < nurls; i++) {
        if (uploading ? resolve(&probes[i].post) || resolve(&probes[i].stats) : resolve(&dl_urls[i])) {
            fprintf(stderr, "native: cannot resolve %s\n", uploading ? probes[i].post.host : dl_urls[i].host); return 1;
        }
    }
    window_ms = duration * 1000;
    t_start = now(); t_warm = t_start + WARMUP; t_deadline = t_warm + duration;
    if (write_sample(argv[6], 0, 0, 0, 0)) return 2;

    /* One server counter per probe, opened before the data streams. */
    if (uploading) for (int i = 0; i < nprobes && i < count; i++) {
        struct conn *c = &conns[nconns++];
        c->kind = STATS; c->fd = -1; c->url = &probes[i].stats; c->probe = &probes[i]; probes[i].counter = c;
    }
    for (int i = 0; i < count; i++) {
        struct conn *c = &conns[nconns++];
        c->fd = -1;
        if (uploading) { int p = i % (nprobes < count ? nprobes : (int)count); c->kind = UP; c->probe = &probes[p]; c->url = &probes[p].post; }
        else { c->kind = DL; c->url = &dl_urls[i % nurls]; }
    }
    if (uploading && nprobes > count) nprobes = (int)count;

    /* Live "current" speed over a sliding 2 s window: 0.5 s deltas are too noisy to display. */
    double hist_t[5] = {0}; long long hist_b[5] = {0}; int hist_n = 0;
    double last_sample = t_start;
    while (!stopped && !fatal) {
        double t = now();
        int n = 0, done = 1;
        if (!uploading && t >= t_deadline) break;
        if (uploading) {
            for (int i = 0; i < nprobes; i++) if (!probes[i].window_done) done = 0;
            if (done || t >= t_deadline + GRACE) break;
        }
        for (int i = 0; i < nconns && !fatal; i++) {
            struct conn *c = &conns[i];
            if (c->fd < 0 && t >= c->retry_at && (c->kind == STATS || t < t_deadline + (uploading ? GRACE : 0)))
                if (open_conn(c)) fail_conn(c, "connect failed");
            if (c->fd < 0) continue;
            pfd[n].fd = c->fd;
            pfd[n].events = POLLIN | (c->state == CONNECTING || c->state == SENDING ? POLLOUT : 0);
            pfd[n].revents = 0; n++;
        }
        if (fatal) break;
        if (poll(pfd, (nfds_t)n, 50) < 0 && errno != EINTR) { fatal = 1; break; }
        for (int i = 0, k = 0; i < nconns && k < n; i++) {
            struct conn *c = &conns[i];
            if (c->fd < 0 || pfd[k].fd != c->fd) continue;
            short ev = pfd[k++].revents;
            if (ev & (POLLIN | POLLHUP | POLLERR)) on_readable(c);
            if (c->fd >= 0 && (ev & POLLOUT)) on_writable(c);
        }
        t = now();
        if (t - last_sample >= 0.5) {
            double current, average, elapsed = t > t_warm ? t - t_warm : 0;
            long long bytes = uploading ? upload_bytes(probes, nprobes) : dl_window_bytes;
            if (hist_n == 5) { memmove(hist_t, hist_t + 1, 4 * sizeof(*hist_t)); memmove(hist_b, hist_b + 1, 4 * sizeof(*hist_b)); hist_n = 4; }
            hist_t[hist_n] = t; hist_b[hist_n++] = bytes;
            current = hist_n > 1 ? (bytes - hist_b[0]) * 8.0 / (t - hist_t[0]) / 1e6 : 0;
            average = uploading ? upload_mbps(probes, nprobes) : (elapsed > 0 ? bytes * 8.0 / (t < t_deadline ? elapsed : duration) / 1e6 : 0);
            if (t < t_warm) current = average = 0;
            if (write_sample(argv[6], current, average, elapsed, 0)) { fatal = 1; break; }
            last_sample = t;
        }
    }
    for (int i = 0; i < nconns; i++) close_conn(&conns[i]);

    double result = uploading ? upload_mbps(probes, nprobes) : dl_window_bytes * 8.0 / duration / 1e6;
    long long bytes = uploading ? upload_bytes(probes, nprobes) : dl_window_bytes;
    if (uploading) for (int i = 0; i < nprobes; i++)
        if (!probes[i].win_start || !probes[i].window_done) {
            fprintf(stderr, "native: server counter %s covered %lld of %lld ms\n", probes[i].stats.host,
                    probes[i].win_start ? probes[i].last_t - probes[i].win_start : 0, window_ms);
            fatal = 1;
        }
    if (!stopped && (bytes <= 0 || result <= 0)) fatal = 1;
    write_sample(argv[6], result, result, now() - t_warm, 1);
    fprintf(stderr, "native: %s connections=%d responses=%d errors=%d bytes=%lld peak_rss_kb=%ld\n",
            argv[1], connects, responses, errors, bytes, peak_rss_kb());
    if (stopped) return 130;
    if (fatal) { fprintf(stderr, "Transfer failed: no valid throughput result\n"); return 1; }
    printf("%.2f\n", result);
    return 0;
}
