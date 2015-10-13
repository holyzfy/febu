var mongoose = require('mongoose');
var async = require('async');
var config = require('config');
var debug = require('debug')('febu:db.js');

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
	busy: Boolean
});

var getModel = function(model) {
	var hasDefined = mongoose.modelNames().some(function(item) {
		return item === model;
	});

	return mongoose.model(model, hasDefined ? null : eval(model + 'Schema'));
};

/**
 * 读取项目配置
 * @param  repo 
 * @param  callback 
 * @return {Query} @link http://mongoosejs.com/docs/queries.html
 */
db.projects.find = function(repo, callback) {
	var Project = getModel('Project');
	// debug('repo=', repo);
	return Project.findOne({
		repo: repo
	}, function(err, data) {
		var ret = data ? data.toObject() : null;
		callback(err, ret);
	});
};

// 新建或更新项目配置
db.projects.save = function(data, callback){
	var Project = getModel('Project');
	// debug('projects.save', data);
	return Project.update({repo: data.repo}, data, {upsert: true}, callback);
};

db.projects.remove = function(conditions, callback) {
	var Project = getModel('Project');
	return Project.remove(conditions, callback);
};

var ResourceSchema = new Schema({
	repo: String,
	src: [String],
	dest: String,
	rel: [String] // 被哪些文件引用了
});

/**
 * 读取静态资源文件
 * @param  <Object> conditions mongodb selector
 * @param  callback
 * @return {Query}  @link http://mongoosejs.com/docs/queries.html
 */
db.resources.find = function(conditions, callback) {
	// debug('resource conditions=', conditions);
	var Resource = getModel('Resource');
	Resource.find(conditions, function(err, docs) {
		if(err) {
			return callback(err);
		}
		var ret = [];
		docs.forEach(function(doc) {
			ret.push(doc.toObject());
		});
		callback(null, ret);
	});
};

db.resources.save = function(data, callback){
	data = [].concat(data);
	var Resource = getModel('Resource');
	
	var saveOne = function(one, cb) {
		var conditions = {
			src: one.src
		};
		Resource.update(conditions, one, {upsert: true}, cb);
	};

	var actions = [];
	data.forEach(function(item) {
		var action = function(cb) {
			saveOne(item, cb);
		};
		actions.push(action);
	});
	
	async.series(actions, callback);
};

db.resources.remove = function(conditions, callback) {
	var Resource = getModel('Resource');
	return Resource.remove(conditions, callback);
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
	// debug('versioins conditions=%o', conditions);
	var Version = getModel('Version');
	Version.findOne({
		'$query': conditions,
		'$orderby':{
			'_id': -1
		}
	}, function(err, data) {
		var ret = data ? data.toObject() : null;
		callback(err, ret);
	});
};

db.versions.save = function(data, callback) {
	var Version = getModel('Version');
	var conditions = {
		repo: data.repo,
		src: data.src,
		type: data.type
	};
	return Version.update(conditions, data, {upsert: true}, callback);
};

db.versions.remove = function(conditions, callback) {
	var Version = getModel('Version');
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
	// @link http://mongoosejs.com/docs/api.html#connection_Connection-readyState
	if(conn.readyState === 0) {
		mongoose.connect(config.database, callback);
	} else {
		callback();
	}
};

db.close = function(callback) {
	if(conn.readyState !== 0) {
		conn.close(callback);
	} else {
		callback();
	}
};

module.exports = db;