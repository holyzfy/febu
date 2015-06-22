var path = require('path');
var fs = require('fs');
var debug = require('debug')('febu:' + __filename);
var rename = require("gulp-rename");
var gulpFilter = require('gulp-filter');
var uglify = require('gulp-uglify');
var minifyCss = require('gulp-minify-css');
var replace = require('gulp-replace');
var util = require('./util.js');

var version = (new Date).getTime();

var p = {};

// 打版本号
p.ver = function(projectCfg, _path){
	var build = util.getCwd(projectCfg.repo, 'build');
	var p = path.resolve(build, _path.dirname, _path.basename + _path.extname);
	var isFile = fs.lstatSync(p).isFile();
	if(isFile) {
		_path.basename += ('.' + version);
	}
};

// 替换外链script标签
function replaceScript(projectCfg, search) {
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

		replaceScript.cache = replaceScript.cache || {};
		if(!replaceScript.cache[group]) {
			script = '<script src="' + groupSrc + '"></script>';
			replaceScript.cache[group] = true;
		}
	} else {
		// 处理单个script外链
		var newSrc = src.replace(/.js$/, '.' + version + '.js');
		newSrc = newSrc.match(/^(?:https?:)?(.+)$/)[1];
		script = '<script src="' + newSrc + '"></script>';
	}

	return script;
}

// 压缩 + 打版本号
p.minify = function(projectCfg){
	var gulp = this;
	var build = util.getCwd(projectCfg.repo, 'build');
	var dest = util.getCwd(projectCfg.repo, 'dest');

	var jsFilter = gulpFilter('**/*.js');
	var cssFilter = gulpFilter('**/*.css');

	return gulp.src('**/*', {
			cwd: path.join(build, '..'),
			base: build
		})
		.pipe(gulpFilter(util.getStaticFileType()))
		
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
p.html = function(projectCfg, callback){
	var gulp = this;
	var src = util.getCwd(projectCfg.repo, 'src');
	var dest = util.getCwd(projectCfg.repo, 'dest');

	return gulp.src('**/*.?(shtml|html|htm)', {
			cwd: path.join(src, '..'),
			base: src
		})

		// TODO合并js
		.pipe(replace(util.regex.scriptTag, function(search) {
			return replaceScript(projectCfg, search);
		}))

		// TODO 替换单个js外链
		
		// TODO 合并css
		
		// TODO 替换单个css外链

		.pipe(gulp.dest(dest))
		.on('end', function(){
			// TODO 标记该项目busy = false
			callback();
		})
		.on('error', function(err){
			// TODO 标记该项目busy = false
			callback(err);
		});
}

module.exports = p;

