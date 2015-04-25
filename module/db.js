var mongoose = require('mongoose');

var db = {};
var db.projects = {};
var db.resources = {};

/**
 * 读取项目配置
 * @param  repo 
 * @param  callback 
 * @return {Query} @link http://mongoosejs.com/docs/queries.html
 */
db.projects.find = function(repo, callback) {

};

// 新建或更新项目配置
db.projects.save = function(project, callback){

};

db.projects.remove = function(conditions, callback) {

};

/**
 * 读取静态资源文件
 * @param  <Object>conditions mongodb selector
 * @param  callback
 * @return {Query}  @link http://mongoosejs.com/docs/queries.html
 */
db.resources.find = function(conditions, callback) {

};

db.resources.save = function(resource, callback){

};

db.resources.remove = function(conditions, callback) {

};

module.exports = db;