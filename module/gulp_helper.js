var glob = require("glob");
var path = require('path');
var async = require('async');
var fs = require('fs');
var debug = require('debug')('febu:' + __filename);
var rename = require("gulp-rename");
var gulpFilter = require('gulp-filter');
var uglify = require('gulp-uglify');
var minifyCss = require('gulp-minify-css');
var del = require('del');
var replace = require('gulp-replace');
var exit = require('gulp-exit');
var config = require('../config.js');
var util = require('./util.js');
var Git = require('./git.js');

var helper = {};

var version = (new Date).getTime();
var ignore = ['**/*.less', '**/*.md', '**/*.markdown'];

// 打版本号
helper.ver = function(projectCfg, _path){
	var build = util.getCwd(projectCfg.repo, 'build');
	var p = path.resolve(build, _path.dirname, _path.basename + _path.extname);
	var isFile = fs.lstatSync(p).isFile();
	if(isFile) {
		_path.basename += ('.' + version);
	}
};

// 替换外链script标签
helper.replaceScript = function(projectCfg, search) {
	var script = '';
	// debug('replaceScript:', search);
	var srcReg = /\bsrc="([^"]*)"|\bsrc='([^']*)'|\bsrc=([^\s]+)(?=[\s>])/i;
	var srcMatch = search.match(srcReg);
	var src = '';
	if(srcMatch) {
		src = srcMatch[1] || srcMatch[2] || srcMatch[3];
	}

	var groupReg = /\b_group="([^"]*)"|\b_group='([^']*)'|\b_group=([^\s]+)(?=[\s>])/i;
	var groupMatch = search.match(groupReg);
	if(groupMatch) {
		// 合并多个script外链
		var group = groupMatch[1] || groupMatch[2] || groupMatch[3];
		var pathname = util.getPathname(projectCfg.repo);
		var filename = [group, version, 'group', 'js'].join('.');
		var rootPath = projectCfg.production.web.match(/(.+)\/?$/)[1];
		var groupSrc = [rootPath, pathname, 'js', filename].join('/');

		helper.replaceScript.cache = helper.replaceScript.cache || {};
		if(!helper.replaceScript.cache[group]) {
			script = '<script src="' + groupSrc + '"></script>';
			helper.replaceScript.cache[group] = true;
		}
	} else {
		// 处理单个script外链
		var newSrc = src.replace(/.js$/, '.' + version + '.js');
		newSrc = newSrc.match(/^(?:https?:)?(.+)$/)[1];
		script = '<script src="' + newSrc + '"></script>';
	}

	return script;
};

// 检出版本库相应的版本
helper.getProject = function(projectCfg, commit, callback){
	var git = new Git(projectCfg.repo);
	var tasks = [
		function(cb){
			debug('clone');
			var src = util.getCwd(projectCfg.repo, 'src');
			util.isEmpty(src, function(empty){
				if(empty) {
					git.clone(cb);
				} else {
					debug('仓库已存在');
					cb();
				}
			});
		},
		function(cb){
			debug('checkout master');
			git.checkout('master', cb);
		},
		function(cb){
			debug('pull');
			git.pull(cb);
		},
		function(cb){
			debug('checkout ', commit);
			git.checkout(commit, cb);
		}
	];
	async.series(tasks, callback);
};

// 收集要处理的文件列表
helper.getSource = function(projectCfg, commit, callback) {
	var source = [];
	var git = new Git(projectCfg.repo);
	var src = util.getCwd(projectCfg.repo, 'src');
	git.diff(projectCfg.version, commit, function(err, ret) {
		if(err) return callback(err);

		ret.forEach(function(item){
			item = path.join(src, item);
			source.push(item)
		});
		// debug('source=', source);
		callback(null, source);
	});
};

// 压缩 + 打版本号
helper.minify = function(projectCfg){
	var gulp = this;
	var build = util.getCwd(projectCfg.repo, 'build');
	var dest = util.getCwd(projectCfg.repo, 'dest');

	var jsFilter = gulpFilter('**/*.js');
	var cssFilter = gulpFilter('**/*.css');
	var ignoreHtmlFilter = gulpFilter(ignore);

	return gulp.src('**/*', {
			cwd: path.join(build, '..'),
			base: build,
			ignore: ignore
		})
		
		// 压缩js
		.pipe(jsFilter)
		.pipe(uglify())
		.pipe(jsFilter.restore())


		// 压缩css
		.pipe(cssFilter)
		.pipe(minifyCss())
		.pipe(cssFilter.restore())

		// 打版本号
		.pipe(rename(function(path) {
			helper.ver(projectCfg, path);
		}))

		.pipe(gulp.dest(dest));
};

// 处理html文件
helper.html = function(projectCfg, callback){
	var gulp = this;
	var src = util.getCwd(projectCfg.repo, 'src');
	var dest = util.getCwd(projectCfg.repo, 'dest');
	var scriptTag = /<script\b[^<]*\bsrc=[^<]*(?:(?!<\/script>)<[^<]*)*(?:<\/script>|$)/mgi;

	return gulp.src('**/*.?(shtml|html|htm)', {
			cwd: path.join(src, '..'),
			base: src
		})

		// TODO合并js
		.pipe(replace(scriptTag, function(search) {
			return helper.replaceScript(projectCfg, search);
		}))

		// TODO 替换单个js外链
		
		// TODO 合并css
		
		// TODO 替换单个css外链

		.pipe(gulp.dest(dest))
		.pipe(exit());
}

module.exports = helper;