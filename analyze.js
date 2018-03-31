'use strict';

const fs = require('fs');
const http = require('http');
const { promisify } = require('util');

const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);

function get(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      const { statusCode } = res;
      const contentType = res.headers['content-type'];

      let error;
      if (statusCode !== 200) {
        error = new Error('Request Failed.\n' +
                          `Status Code: ${statusCode}`);
      }

      if (error) {
        // consume response data to free up memory
        res.resume();
        reject(error);
        return;
      }

      res.setEncoding('utf8');
      let rawData = '';
      res.on('data', (chunk) => { rawData += chunk; });
      res.on('end', () => {
        try {
          const parsedData = JSON.parse(rawData);
          resolve(parsedData);
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

async function fetch(url, name) {
  let data;

  try {
    data = JSON.parse(await readFile(name, 'utf-8'));
  } catch ({}) {
    data = await get(url);

    await writeFile(name, JSON.stringify(data));
  }

  return data;
}

function buildLink(baseUrl, build) {
  const url = baseUrl + `/#/builders/${build.builderid}/builds/${build.buildid}`;
  return `[${build.buildid}](${url})`;
}

(async function(baseUrl) {
  let [initiator, remote, local, uploader] = await Promise.all([
    fetch(baseUrl + '/api/v2/builders/2/builds?property=got_revision&property=build_speed', 'initiator-builds.json'),
    fetch(baseUrl + '/api/v2/builders/1/builds?property=revision&property=browser_name', 'remote-builds.json'),
    fetch(baseUrl + '/api/v2/builders/3/builds?property=revision&property=browser_name', 'local-builds.json'),
    fetch(baseUrl + '/api/v2/builders/4/builds?property=revision&property=browser_name', 'uploader-builds.json')
  ]);

  initiator.builds = initiator.builds.map((build) => {
    if (!build.properties.build_speed) {
      return [];
    }

    const browser_names = build.properties.build_speed[0] === 'fast' ?
      ['chrome', 'firefox'] : ['edge', 'safari'];

    return browser_names.map((browser_name) => {
      return Object.assign({ browser_name }, build);
    });
  }).reduce((all, pair) => all.concat(pair), []);

  const pairs = initiator.builds.map((initiator_build) => {
    const browser = initiator_build.browser_name;
    const revision = initiator_build.properties.got_revision[0];
    const match = uploader.builds.find((uploader_build) => {
      return uploader_build.properties.browser_name[0] === browser &&
        uploader_build.properties.revision[0] === revision;
    });
    return [initiator_build, match];
  });

  console.log('Initiator | Browser | Uploader | Duration');
  console.log('----------|---------|----------|---------');

  pairs.forEach(([a, b]) => {
    const l1 = buildLink(baseUrl, a);
    let l2;
    let durationStr;
    if (b) {
      const durationMins = Math.round((b.complete_at - a.started_at) / 60);
      durationStr = `${Math.floor(durationMins / 60)}h ${durationMins % 60}s`;
      l2 = buildLink(baseUrl, b);
    } else {
      durationStr = '∞';
      l2 = 'n/a';
    }

    console.log(l1 + ' | ' + a.browser_name + ' | ' + l2 + ' | ' + durationStr);
  });
}('http://builds.wpt.fyi'));
