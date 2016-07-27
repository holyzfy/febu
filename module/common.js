var config = require('config');
var url = require('url');
var path = require('path');
var debug = require('debug')('febu:' + __filename);
var common = {};

common.getPathname = repo => {
    var urlMap = url.parse(repo);
    var pathname = urlMap.pathname.match(/^\/?(.*)$/)[1].replace('/', '_');
    return ('.git' === pathname.slice(-4)) ? pathname.slice(0, -4) : pathname;
};

/**
 * 取得仓库的根目录
 * @param repo 仓库地址
 * @param type 有效值src, build, development, production
 * @return {String}
 */
common.getCwd = (repo, type) => {
    var dataPath = path.resolve(__dirname, '..', config.dataPath);
    return path.resolve(dataPath, type, url.parse(repo).hostname, common.getPathname(repo));
};

module.exports = common;