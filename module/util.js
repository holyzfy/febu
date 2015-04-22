var config = require('../config.js');
var url = require('url');
var path = require('path');
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
 * @param type 有效值src, build, dest
 * @return {String}
 */
util.getCwd = function (repo, type) {
	var dataPath = config.dataPath || 'data/';
    var pathname = util.getPathname(repo);
    var urlMap = url.parse(repo);
    var local = path.resolve(dataPath, type, urlMap.hostname, pathname);
    return local;
}

module.exports = util;