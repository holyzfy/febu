var mongoose = require('mongoose');
var config = require('../config.js');
var debug = require('debug')('febu:' + __filename);

var db = {};
db.projects = {};
db.resources = {};

var Schema = mongoose.Schema;
var ProjectSchema = new Schema({
	repo: String,
	development: {
		ftp: String,
		web: String 
	},
	production: {
		ftp: String,
		web: String 
	},
	version: String
});

/**
 * 读取项目配置
 * @param  repo 
 * @param  callback 
 * @return {Query} @link http://mongoosejs.com/docs/queries.html
 */
db.projects.find = function(repo, callback) {
	var Project = mongoose.model('Project', ProjectSchema);
	Project.findOne({
		repo: repo
	}, callback);
};

// 新建或更新项目配置
db.projects.save = function(data, callback){
	var Project = mongoose.model('Project', ProjectSchema);
	Project.update({repo: data.repo}, data, {upsert: true}, callback);
};

db.projects.remove = function(conditions, callback) {
	var Project = mongoose.model('Project', ProjectSchema);
	return Project.remove(conditions, callback);
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

db.init = function(callback) {
	var conn = mongoose.connection;
	var readyState = mongoose.connection.readyState;
	conn.on('open', function() {
		debug('connection open');
	});
	conn.on('close', function() {
		debug('connection close');
	});
	conn.on('error', function(err){
		debug('connection error ', err);
	});
	mongoose.connect(config.database, callback);
	return this;
};

module.exports = db;