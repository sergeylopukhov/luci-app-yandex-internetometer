'use strict';
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const source = fs.readFileSync(require('path').join(__dirname, '../htdocs/luci-static/resources/view/status/yandex-internetometer-live.js'), 'utf8');
let pending = [], frames = 0;
const context = { window: { localStorage: { getItem: () => null }, matchMedia: () => ({matches: true}), cancelAnimationFrame: () => {}, requestAnimationFrame: () => { frames++; } },
    fs: { exec_direct: () => new Promise((resolve, reject) => pending.push({resolve, reject})) } };
vm.createContext(context); vm.runInContext(source.slice(0, source.indexOf('return view.extend({')), context);
(async () => {
    context.statusData = {running:true, phase:'upload', download_mbps:100};
    let p = context.statusCall('status'); pending.shift().reject(Error('timeout'));
    let data = await p;
    assert.equal(data.running, true); assert.equal(data.download_mbps, 100); assert.equal(data.connection_error, true);
    context.statusData = data;
    p = context.statusCall('status'); pending.shift().resolve({running:false,phase:'complete',upload_mbps:80});
    data = await p; assert.equal(data.connection_error, false); assert.equal(data.upload_mbps,80);
    const older = context.statusCall('status'), newer = context.statusCall('stop');
    const a = pending.shift(), b = pending.shift();
    b.resolve({running:false,phase:'cancelled'}); context.statusData = await newer;
    a.resolve({running:true,phase:'upload'}); assert.equal((await older).phase,'cancelled');
    let value; context.animateValue('download',123,450,x => value=x);
    assert.equal(value,123); assert.equal(frames,0);
    assert.equal(context.historyNumber(null),null); assert.equal(context.historyNumber(''),null);
    assert.equal(context.historyNumber(0),0);
    assert.equal(context.hasVisibleResult({running:false,download_mbps:100}),true);
    console.log('status UI tests: ok');
})().catch(e => { console.error(e); process.exit(1); });
