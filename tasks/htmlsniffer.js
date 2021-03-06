/*
 * grunt-html-sniffer
 * https://github.com/researchgate/grunt-html-sniffer
 *
 * Copyright (c) 2015 ResearchGate GmbH
 * Licensed under the MIT license.
 */

'use strict';
var htmlparser = require('../lib/parsers/htmlparser'),
    Promise = require('promise'),
    Queue = require('promise-queue'),
    glob = Promise.denodeify(require('glob')),
    flatten = require('flatten'),
    checks = require('../lib/checks'),
    reporters = require('../lib/reporters');

Queue.configure(Promise);

function getFilesFromPath(patterns, options) {
    if (!patterns) {
        grunt.fail.warn('No source file paths found.');
    }

    return Promise.all(patterns.map(function (pattern) {
        return glob(pattern, options);
    }));
}

function mapQueued(numConcurrent, keys, fn) {
    var queue = new Queue(numConcurrent, Infinity);
    var promises = keys.map(
        function (key) {
            return queue.add(
                function () {
                    return fn(key);
                }
            );
        }
    );
    return promises;
}

module.exports = function (grunt) {
    grunt.registerMultiTask('htmlsniffer', 'Sniffer for your HTML sources', function () {
        var done = this.async(),
            checksConfig = this.data.checks,
            self = this;

        var results = getFilesFromPath(this.data.src)
            .then(flatten)
            .then(function (files) {
                return Promise.all(mapQueued(50, files, htmlparser));
            })
            .then(flatten);

        results.then(
            function (data) {
                return Object.keys(checksConfig).map(
                    function (checkName) {
                        var check = checks[checkName],
                            config = checksConfig[checkName];

                        if (!check) {
                            grunt.fail.warn('Check ' + checkName + ' not found.');
                            return;
                        }

                        return check(data, config);
                    }
                );
            }
        )
        .then(flatten)
        .then(function (results) {
            if (self.data.options.checkstyle) {
                grunt.file.write(self.data.options.checkstyle, reporters.checkstyle(results));
            } else {
                reporters.console(grunt, results);
            }

            done();
        }).done();
    });
};
