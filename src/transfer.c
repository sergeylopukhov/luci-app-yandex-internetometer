#define _POSIX_C_SOURCE 200809L
#include <curl/curl.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <signal.h>
#include <time.h>
#include <unistd.h>
#ifdef __linux__
#include <sys/prctl.h>
#endif

/* One process, bounded buffers, persistent connections. No payload allocation. */
#define MAX_STREAMS 12
#define MAX_URLS 32
struct stream { CURL *easy; curl_off_t current, sent, limit; int added; };
static volatile sig_atomic_t stopped;
static int uploading;
static curl_off_t payload_size;
static void stop_signal(int sig) { (void)sig; stopped = 1; }
static double now(void) { struct timespec t; clock_gettime(CLOCK_MONOTONIC, &t); return t.tv_sec + t.tv_nsec / 1e9; }
static size_t discard(char *p, size_t s, size_t n, void *ctx) { (void)p; (void)ctx; return s*n; }
static size_t zeros(char *p, size_t s, size_t n, void *ctx) {
    struct stream *st = ctx;
    curl_off_t left = st->limit - st->sent;
    size_t bytes = s*n;
    if ((curl_off_t)bytes > left) bytes = (size_t)left;
    memset(p, 0, bytes); st->sent += bytes; return bytes;
}
static int progress(void *ctx, curl_off_t dt, curl_off_t dn, curl_off_t ut, curl_off_t un) {
    (void)dt; (void)ut;
    ((struct stream *)ctx)->current = uploading ? un : dn;
    return stopped ? 1 : 0;
}
static curl_off_t total_bytes(struct stream *streams, int count, curl_off_t completed) {
    for (int i=0; i<count; i++) completed += streams[i].current;
    return completed;
}
static int snapshot(const char *path, double rate, double average, double elapsed,
                    int errors, int responses, int final) {
    char tmp[4096];
    if (snprintf(tmp,sizeof(tmp),"%s.tmp",path) >= (int)sizeof(tmp)) return -1;
    FILE *f = fopen(tmp,"w"); if (!f) return -1;
    fprintf(f,"{\"current_mbps\":%.2f,\"average_mbps\":%.2f,\"elapsed\":%.3f,\"errors\":%d,\"responses\":%d,\"final\":%s}\n",
            rate, average, elapsed, errors, responses, final ? "true" : "false");
    if (fclose(f)) return -1;
    return rename(tmp,path);
}
static long integer(const char *s, long lo, long hi) {
    char *end; long n = strtol(s,&end,10);
    if (!*s || *end || n < lo || n > hi) return -1;
    return n;
}
int main(int argc, char **argv) {
    if (argc != 7 || (strcmp(argv[1],"download") && strcmp(argv[1],"upload"))) {
        fprintf(stderr,"usage: transfer download|upload seconds streams bytes urls-file sample-file\n"); return 2;
    }
    uploading = !strcmp(argv[1],"upload");
    long duration = integer(argv[2],1,60), count = integer(argv[3],1,MAX_STREAMS);
    payload_size = integer(argv[4],1024,200000000);
    if (duration < 0 || count < 0 || payload_size < 0) return 2;
    char urls[MAX_URLS][4096]; int nurls=0;
    FILE *f = fopen(argv[5],"r"); if (!f) return 2;
    while (nurls < MAX_URLS && fgets(urls[nurls],sizeof(urls[0]),f)) {
        urls[nurls][strcspn(urls[nurls],"\r\n")] = 0;
        if (strncmp(urls[nurls],"https://",8) && strncmp(urls[nurls],"http://",7)) { fclose(f); return 2; }
        nurls++;
    }
    fclose(f); if (!nurls) return 2;
    signal(SIGTERM,stop_signal); signal(SIGINT,stop_signal);
#ifdef __linux__
    pid_t parent=getppid();
    if (parent == 1 || prctl(PR_SET_PDEATHSIG,SIGTERM) || getppid()!=parent) return 130;
#endif
    if (curl_global_init(CURL_GLOBAL_DEFAULT)) return 2;
    CURLM *multi = curl_multi_init(); if (!multi) { curl_global_cleanup(); return 2; }
    struct stream streams[MAX_STREAMS] = {0};
    struct curl_slist *headers = NULL;
    headers = curl_slist_append(headers,"Content-Type: application/octet-stream");
    headers = curl_slist_append(headers,"Expect:");
    double started=now(), measured=0, last=started, deadline=started+1+duration;
    curl_off_t completed=0, baseline=0, previous=0;
    int errors=0, responses=0, fatal=0, active=0;
    if (snapshot(argv[6],0,0,0,0,0,0)) { curl_slist_free_all(headers); curl_multi_cleanup(multi); curl_global_cleanup(); return 2; }
    for (int i=0; i<count; i++) {
        CURL *e = streams[i].easy = curl_easy_init();
        if (!e) { fatal=1; break; }
#define OPT(k,v) do { if (curl_easy_setopt(e,k,v) != CURLE_OK) { fatal=1; } } while (0)
        OPT(CURLOPT_URL,urls[i%nurls]);
        OPT(CURLOPT_PRIVATE,&streams[i]);
        OPT(CURLOPT_WRITEFUNCTION,discard);
        OPT(CURLOPT_XFERINFOFUNCTION,progress);
        OPT(CURLOPT_XFERINFODATA,&streams[i]);
        OPT(CURLOPT_NOPROGRESS,0L);
        OPT(CURLOPT_NOSIGNAL,1L);
        OPT(CURLOPT_CONNECTTIMEOUT_MS,4000L);
        OPT(CURLOPT_TIMEOUT_MS,(duration+1)*1000L);
        OPT(CURLOPT_FAILONERROR,1L);
        OPT(CURLOPT_PROTOCOLS_STR,"http,https");
        OPT(CURLOPT_FOLLOWLOCATION,0L);
        OPT(CURLOPT_BUFFERSIZE,32768L);
        OPT(CURLOPT_UPLOAD_BUFFERSIZE,32768L);
        OPT(CURLOPT_USERAGENT,"Yandex Internetometer/OpenWrt");
        OPT(CURLOPT_REFERER,"https://yandex.ru/internet/");
        if (uploading) {
            OPT(CURLOPT_POST,1L);
            OPT(CURLOPT_READFUNCTION,zeros);
            OPT(CURLOPT_READDATA,&streams[i]);
            streams[i].limit = payload_size < 65536 ? payload_size : 65536;
            OPT(CURLOPT_POSTFIELDSIZE_LARGE,streams[i].limit);
            OPT(CURLOPT_HTTPHEADER,headers);
        }
        if (fatal || curl_multi_add_handle(multi,e) != CURLM_OK) { fatal=1; break; }
        streams[i].added=1;
    }
    while (!stopped && !fatal && now() < deadline) {
        if (curl_multi_perform(multi,&active) != CURLM_OK) { fatal=1; break; }
        int pending; CURLMsg *msg;
        while ((msg=curl_multi_info_read(multi,&pending))) {
            if (msg->msg != CURLMSG_DONE) continue;
            struct stream *st=NULL; long code=0;
            curl_easy_getinfo(msg->easy_handle,CURLINFO_PRIVATE,&st);
            curl_easy_getinfo(msg->easy_handle,CURLINFO_RESPONSE_CODE,&code);
            completed += st->current; st->current=0;
            curl_multi_remove_handle(multi,st->easy); st->added=0;
            if (msg->data.result == CURLE_OK && code >= 200 && code < 300) responses++;
            else if (msg->data.result == CURLE_OPERATION_TIMEDOUT && now() >= deadline - 0.05) {
                /* The measurement deadline intentionally ends in-flight transfers. */
            }
            else {
                errors++;
                /* A failure is never presented as a clean throughput result. */
                fprintf(stderr,"transfer failure: curl=%d HTTP=%ld\n",msg->data.result,code);
                fatal=1; break;
            }
            double remaining=deadline-now();
            if (remaining > 0.01) {
                st->sent=0; st->limit=payload_size;
                if (uploading) curl_easy_setopt(st->easy,CURLOPT_POSTFIELDSIZE_LARGE,st->limit);
                curl_easy_setopt(st->easy,CURLOPT_TIMEOUT_MS,(long)(remaining*1000)+250L);
                if (curl_multi_add_handle(multi,st->easy) != CURLM_OK) { fatal=1; break; }
                st->added=1;
            }
        }
        double t=now(); curl_off_t bytes=total_bytes(streams,(int)count,completed);
        if (!measured && t-started >= 1) { measured=t; baseline=previous=bytes; last=t; }
        if (measured && t-last >= 0.5) {
            if (snapshot(argv[6],(bytes-previous)*8/(t-last)/1e6,(bytes-baseline)*8/(t-measured)/1e6,t-measured,errors,responses,0)) { fatal=1; break; }
            last=t; previous=bytes;
        }
        if (!fatal && curl_multi_poll(multi,NULL,0,50,NULL) != CURLM_OK) { fatal=1; break; }
    }
    double ended=now();
    curl_off_t bytes=total_bytes(streams,(int)count,completed)-baseline;
    double seconds=measured ? ended-measured : 0;
    /* For a long in-flight POST, headers may arrive only after the deadline.
       Unacknowledged application data cannot establish a valid server response. */
    if (!uploading && !responses) {
        for (int i=0;i<count;i++) if (streams[i].easy) {
            long code=0; curl_easy_getinfo(streams[i].easy,CURLINFO_RESPONSE_CODE,&code);
            if (code >= 200 && code < 300) responses++;
        }
    }
    if (!responses || bytes <= 0 || seconds <= 0) fatal=1;
    double average=seconds > 0 ? bytes*8/seconds/1e6 : 0;
    snapshot(argv[6],average,average,seconds,errors,responses,1);
    for (int i=0;i<count;i++) if (streams[i].easy) {
        if (streams[i].added) curl_multi_remove_handle(multi,streams[i].easy);
        curl_easy_cleanup(streams[i].easy);
    }
    curl_slist_free_all(headers); curl_multi_cleanup(multi); curl_global_cleanup();
    if (stopped) return 130;
    if (fatal) return 1;
    printf("%.2f\n",average);
    return 0;
}
