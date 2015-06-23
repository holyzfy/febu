var mongoose = require('mongoose');
var config = require('../config.js');
var debug = require('debug')('febu:' + __filename);

var db = {};
db.projects = {};
db.resources = {};
db.versions = {};

var Schema = mongoose.Schema;

var ProjectSchema = new Schema({
	repo: String,
	development: {
		async: String,
		web: String
	},
	production: {
		async: String,
		web: String 
	},
	version: String,
	busy: Boolean
});

/**
 * 读取项目配置
 * @param  repo 
 * @param  callback 
 * @return {Query} @link http://mongoosejs.com/docs/queries.html
 */
db.projects.find = function(repo, callback) {
	var Project = mongoose.model('Project', ProjectSchema);
	debug('repo=', repo);
	return Project.findOne({
		repo: repo
	}, function(err, data) {
		var ret = data ? data.toObject() : null;
		callback(err, ret);
	});
};

// 新建或更新项目配置
db.projects.save = function(data, callback){
	var Project = mongoose.model('Project', ProjectSchema);
	debug('projects.save', data);
	return Project.update({repo: data.repo}, data, {upsert: true}, callback);
};

db.projects.remove = function(conditions, callback) {
	var Project = mongoose.model('Project', ProjectSchema);
	return Project.remove(conditions, callback);
};

var ResourceSchema = new Schema({
	// TODO
});

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

var VersionSchema = new Schema({
	repo: String,

	// 发布类型
	type: {
		type: String,
		enum: ['development', 'production']
	},

	// 源版本号
	src: String,

	// 对应目标仓库的版本号
	dest: String
});

db.versions.find = function(conditions, callback) {
	var Version = mongoose.model('Version', VersionSchema);
	Version.findOne(conditions, function(err, data) {
		callback(err, data.toObject());
	});
};

db.versions.save = function(data, callback) {
	var Version = mongoose.model('Version', VersionSchema);
	var conditions = {
		repo: data.repo,
		src: data.src
	};
	return Version.update(conditions, data, {upsert: true}, callback);
};

db.versions.remove = function(conditions, callback) {
	var Version = mongoose.model('Version', VersionSchema);
	return Version.remove(conditions, callback);
}

var conn = mongoose.connection;

conn.on('open', function() {
	debug('connection open');
});
conn.on('close', function() {
	debug('connection close');
});
conn.on('error', function(err){
	debug('connection error ', err);
});

db.open = function(callback) {
	return mongoose.connect(config.database, callback);
};

db.close = function(callback) {
	return conn.close(callback);
};

module.exports = db;