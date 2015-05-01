var config = require('../config.js');
var url = require('url');
var path = require('path');
var fs = require('fs');

var util = {};

/**
 * 取得仓库的路径名
 * @param  {[type]} repo [description]
 * @return {[type]}      [description]
 */
util.getPathname = function(repo) {
	var urlMap = url.parse(repo);
    var pathname = urlMap.pathname.match(/^\/?(.*)$/)[1].replace('/', '_');
    return pathname;
};

/**
 * 取得仓库的根目录
 * @param repo 仓库地址
 * @param type 有效值src, build, development, production
 * @return {String}
 */
util.getCwd = function (repo, type) {
	var dataPath = config.dataPath || 'data/';
    var pathname = util.getPathname(repo);
    var urlMap = url.parse(repo);
    var local = path.resolve(dataPath, type, urlMap.hostname, pathname);
    return local;
}

/**
 * Check if a file or directory is empty
 * see: https://github.com/codexar/npm-extfs
 *
 * @param {string} searchPath
 * @param {Function} cb
 */
util.isEmpty = function (searchPath, cb) {
  fs.stat(searchPath, function (err, stat) {
    if (err) {
      return cb(true);
    }
    if (stat.isDirectory()) {
      fs.readdir(searchPath, function (err, items) {
        if (err) {
          return cb(true);
        }
        cb(!items || !items.length);
      });
    } else {
      fs.readFile(searchPath, function (err, data) {
        if (err) {
          cb(true);
        }
        cb(!data || !data.length)
      });
    }
  });
};

util.reg = {
    script: /<script\b[^<]*\bsrc=[^<]*(?:(?!<\/script>)<[^<]*)*(?:<\/script>|$)/mgi
};

module.exports = util;