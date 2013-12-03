'use strict';
//系统模块
var fs = require('fs');
var utils = require('util');
var path = require('path');
var URL = require('url');
var Event = require('events').EventEmitter;
var event = new Event();

//非系统模块
var clean_css = require('clean-css');
clean_css = new clean_css({
    keepSpecialComments: 0,
    report: false
});
var uglify_js = require('uglify-js');

var $ = require('./lib/helper');
var base64img = require('./lib/css-image-base64');
var json2php = require('./lib/json2php');
var root = __dirname;
var config = require('./config.json');
var map = config.map;
var domain = config.domain;
var output = config.output;
var regJS = /\.js$/i;
var regCss = /\.css$/i;

var cssCount = 0;

var outputJSON = {};
for (var rootDir in map) {
    var id = map[rootDir].id;
    var filter = map[rootDir].filter;
    filter = str2RegExp(filter);

    $.recurse(rootDir, function(filepath, rootdir, subdir, filename) {
        if (!filter || (utils.isRegExp(filter) && !filter.test(filename))) {
            var extname = path.extname(filename);
            var basename = path.basename(filename);
            var dirname = path.dirname(filepath);
            var key = id.split('{$dirname}').join(dirname)
                .split('{$extname}').join(extname)
                .split('{$basename}').join(basename);
            if (regJS.test(filename)) {

                outputJSON[key] = uglify_js.minify(filepath, {
                    output: {
                        ascii_only: true
                    }
                }).code;

            } else if (regCss.test(filename)) {
                var source = $.readFile(filepath);
                cssCount++;
                event.on(filepath, function(key, source) {
                    cssCount--;
                    outputJSON[key] = source;
                    if (cssCount === 0) {
                        event.emit('end');
                    }
                });
                base64img.fromString(source, dirname, rootdir, function(key, filepath) {
                    return function(err, css) {
                        if (domain) {
                            //改为绝对路径
                            css = relative2absolute(css);
                        }
                        css = clean_css.minify(css);
                        event.emit(filepath, key, css);
                    };
                }(key, filepath));

            }
        }

    });
}

event.once('end', function() {
    if (output) {
        for (var i in outputJSON) {
            var p = path.join(output, i);
            console.log(p);
            var content = outputJSON[i];
            $.writeFile(p, content, 'utf-8');
        }

    } else {
        var content = json2php(outputJSON);
        content = ['<?php', 'return ' + content + ';', '?>'].join('\n');

        $.writeFile('output.php', content, 'utf-8');

    }

});

if (cssCount === 0) {
    event.emit('end');
}

/**
 * 将字符串转为正则
 * @param  {[type]} str [description]
 * @return {[type]}     [description]
 */
function str2RegExp(str) {
    if (!str || utils.isRegExp(str)) {
        return str;
    }
    if (str.indexOf('/') === 0) {
        str = str.split('/');
        var attributes = str.pop();

        str = str.filter(function(v) {
            return v !== '';
        });
        var pattern = str.join('').replace(/\\/g, '\\');
    } else {
        var pattern = str;
        var attributes = '';
    }
    return attributes === '' ? new RegExp(pattern) : new RegExp(pattern, attributes);
}


/**
 * 将相对路径转为绝对路径
 * @param  {[type]} cssCode [description]
 * @return {[type]}         [description]
 */
function relative2absolute(cssCode) {
    var cssImgRegex = /url\s?\(['"]?(.*?)(?=['"]?\))/gi,
        absoluteUrlRegex = /^\//,
        externalUrlRegex = /http/,
        baseUrlRegex = /data:(image|application)/;
    if (!cssCode.replace && cssCode.toString) {
        cssCode = cssCode.toString();
    }
    var urls = [],
        match;
    while (match = cssImgRegex.exec(cssCode)) {
        if (baseUrlRegex.test(match[1]) || externalUrlRegex.test(match[1])) {
            continue
        }
        urls.push(match[1]);
    }
    urls.forEach(function(path) {
        cssCode = cssCode.replace(path, URL.resolve(domain, path));

    });
    return cssCode;
}
