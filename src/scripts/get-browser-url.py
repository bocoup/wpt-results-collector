#!/usr/bin/env python

# Copyright 2018 The WPT Dashboard Project. All rights reserved.
# Use of this source code is governed by a BSD-style license that can be
# found in the LICENSE file.

import argparse
import httplib
import os
import re
import subprocess
import tempfile
import urlparse
import urllib


def main(product, channel, platform, bucket_name):
    '''Find the most recent build of a given browser and provide a stable URL
    from which it may be downloaded. Because browser vendors do not necessarily
    commit to hosting outdated builds, this may involve downloading the build
    and persisting it to an internally-managed object storage location.'''

    location = locate_firefox(channel, platform)

    if location is None:
        raise Exception('Unable to locate the requested artifact')

    prefix = '%s-%s-%s' % (product, channel, platform)

    return memoize_artifact(bucket_name, prefix, location)


def locate_firefox(channel, platform):
    if channel == 'nightly':
        channel_url_part = '-nightly'
    else:
        channel_url_part = ''

    url = ('https://download.mozilla.org/' +
           '?product=firefox%s-latest-ssl' % channel_url_part +
           '&os=linux64&lang=en-US')

    return head_request(url).getheader('Location')


def head_request(url):
    parts = urlparse.urlparse(url)
    conn = httplib.HTTPConnection(parts.netloc)
    path = parts.path
    if parts.query:
        path += '?%s' % parts.query
    conn.request('HEAD', path)
    return conn.getresponse()


def memoize_artifact(bucket_name, prefix, url):
    response = head_request(url)
    etag = re.match('"?([^"]*)"?', response.getheader('etag')).groups()[0]

    if not etag:
        raise ValueError('Could not uniquely identify artifact')

    internal_url = 'https://storage.googleapis.com/%s/%s/%s' % (
        bucket_name, prefix, etag
    )

    response = head_request(internal_url)

    if response.status >= 200 and response.status < 300:
        return internal_url

    _, name = tempfile.mkstemp()

    try:
        opener = urllib.URLopener()
        opener.retrieve(url, name)

        return_code = subprocess.check_call([
            'gsutil', 'cp', name, 'gs://%s/%s/%s' % (bucket_name, prefix, etag)
        ])
    finally:
        os.remove(name)

    if return_code != 0:
        raise Exception('Unable to persist artifact')

    return internal_url


parser = argparse.ArgumentParser(description=main.__doc__)
parser.add_argument('--product',
                    choices=('firefox',),
                    required=True)
parser.add_argument('--channel',
                    required=True)
parser.add_argument('--platform',
                    choices=('linux64',),
                    required=True)
parser.add_argument('--bucket-name',
                    required=True)


if __name__ == '__main__':
    print main(**vars(parser.parse_args()))
