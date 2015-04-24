var gulp = require('gulp');
var glob = require("glob");
var path = require('path');
var async = require('async');
var fs = require('fs');
var util = require('./module/util.js');
var config = require('./config.js');
var debug = require('debug')('febu:' + __filename);
var rename = require("gulp-rename");
var gulpFilter = require('gulp-filter');
var uglify = require('gulp-uglify');
var minifyCss = require('gulp-minify-css');
var del = require('del');
var replace = require('gulp-replace');
var argv = require('yargs').argv;
var Git = require('./module/git.js');

var repo = 'https://github.com/holyzfy/trygit'; // 测试用
var src = util.getCwd(repo, 'src');
var build = util.getCwd(repo, 'build');
var dest = util.getCwd(repo, 'dest');
var source = [];
var version = (new Date).getTime();
var ignore = ['**/*.?(shtml|html|htm)', '**/*.less', '**/*.md', '**/*.markdown'];

// 打版本号
var ver = function(_path){
	var p = path.resolve(build, _path.dirname, _path.basename + _path.extname);
	var isFile = fs.lstatSync(p).isFile();
	if(isFile) {
		_path.basename += ('.' + version);
	}
};

// 替换外链script标签
var replaceScript = function(search) {
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
		var pathname = util.getPathname(repo);
		var filename = [group, version, 'js'].join('.');
		// TODO 根据情况决定选用测试环境或者正式环境
		var rootPath = config.qa.match(/(.+)\/?$/)[1];
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
};

gulp.task('clean', function(callback){
	del([build, dest], callback);
});

// 检出版本库相应的版本 --commit commitid
gulp.task('getProject', function(callback){
	var git = new Git(repo);
	var tasks = [
		function(cb){
			git.clone(cb);
		},
		function(cb){
			git.pull(cb);
		},
		function(cb){
			var commit = argv.commit || 'master';
			git.checkout(commit, cb);
		}
	];
	async.series(tasks, callback);
});

// 收集要处理的文件列表
gulp.task('getSource', ['clean', 'getProject'], function(callback){
	glob('**/*', {
		cwd: src,
		ignore: ignore
	}, function(err, files) {
		files.forEach(function(item){
			var newPath = path.resolve(src, item);
			// debug(newPath);
			source.push(newPath);
		});
		callback();
	});
});

// 收集要处理的文件
gulp.task('collectFiles', ['getSource'], function(){
	return gulp.src(source, {
		base: src
	}).pipe(gulp.dest(build));
});

// 压缩 + 打版本号
gulp.task('minify', ['collectFiles'], function(){
	var jsFilter = gulpFilter('**/*.js');
	var cssFilter = gulpFilter('**/*.css');

	return gulp.src('**/*', {
			cwd: path.join(build, '..'),
			base: build
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
		.pipe(rename(ver))

		.pipe(gulp.dest(dest));
});

// 处理html文件
gulp.task('html', ['minify'], function(){
	var scriptTag = /<script\b[^<]*\bsrc=[^<]*(?:(?!<\/script>)<[^<]*)*(?:<\/script>|$)/mgi;

	return gulp.src('**/*.?(shtml|html|htm)', {
			cwd: path.join(src, '..'),
			base: src
		})

		// TODO合并js
		.pipe(replace(scriptTag, replaceScript))

		// TODO 替换单个js外链
		
		// TODO 合并css
		
		// TODO 替换单个css外链

		.pipe(gulp.dest(dest));
});

// 上线
gulp.task('release', ['html']);
