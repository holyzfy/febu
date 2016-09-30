var debug = require('debug')('febu:development.js');
var path = require('path');
var url = require('url');
var fs = require('fs-extra');
var async = require('async');
var gulp = require('gulp');
var gulpFilter = require('gulp-filter');
var through2 = require('through2');
var plumber = require('gulp-plumber');
var exec = require('child_process').exec;
var File = require('vinyl');
var config = require('config');
var colors = require('colors');
var nodeUtil = require('util');
var util = require('./util.js');
var common = require('./common.js');

function Dev(project) {
	this.project = project;
	this.src = common.getCwd(project.repo, 'src');
	this.destRoot = common.getCwd(project.repo, 'development');
	this.destStatic = path.join(this.destRoot, 'static');
	this.ignoreList = util.getIgnore(this.src);
	this.filterList = util.getStaticFileType().concat(this.ignoreList);
}

// 收集静态资源
Dev.prototype.resource = function (done) {
	var filterList = util.getStaticFileType().concat(this.ignoreList);
	console.log(colors.green('输出静态资源：' + this.destStatic));
	gulp.src('**/*', {
		cwd: this.src
	})
	.pipe(plumber(function (err) {
        debug('出错 第%d行: %s', err.lineNumber, err.message);
        this.emit('end');
    }))
	.pipe(gulpFilter(this.filterList))
	.pipe(gulp.dest(this.destStatic))
	.pipe(util.taskDone(done));
};

Dev.prototype.replaceHref = function(attrs, match, file) {
	var href = attrs.filter(item => /^href=/i.test(item))[0];

	var replacement = (match, sub) => {
		var protocol = url.parse(sub).protocol;
		var isAbsolutePath = sub[0] === '/';
		var isVmVar = /[$<{]/.test(sub[0]);
		if(protocol || isAbsolutePath || isVmVar) {
			return match;
		}

		var subPath = util.relPath(file, sub);
		var publicPath = util.getProjectPublicPath(this.project, 'development');
		var newHref = url.resolve(publicPath, subPath);
		return 'href="' + newHref + '"';
	};

	if(/^href="/i.test(href)) {
		match = match.replace(/\bhref="([^"]+)"/i, replacement);
	} else if(/^href='/i.test(href)) {
		match = match.replace(/\bhref='([^']+)'/i, replacement);
	} else if(/^href=(?!["'])/i.test(href)) {
		match = match.replace(/\bhref=([^\s\\>]+)/i, replacement);
	}
	return match;
};

Dev.prototype.resolvePath = function(file, src) {
	var filePath = file.path.replace(new RegExp('\\' + path.sep, 'g'), '/');
	var inc = '/inc/';
	var hasInc = filePath.lastIndexOf(inc) > 0;

	// 约定：inc目录的静态资源路径相对于根目录
	var relativeDir = hasInc ? '' : file.relative.slice(0, 0 - file.basename.length);

	var publicPath = util.getProjectPublicPath(this.project, 'development');
	var newSrc = path.join(relativeDir, src);
	newSrc = url.parse(newSrc).pathname || src; // 去掉查询参数和hash部分
	try {
		fs.accessSync(newSrc);
	} catch(err) {
		var message = nodeUtil.format('File not found: %s (see: %s)', src, file.relative);
		console.warn(colors.yellow(message));
		publicPath = '';
	}

	return url.resolve(publicPath, newSrc);
};

Dev.prototype.replaceSrc = function(attrs, match, file) {
	var src = attrs.filter(item => /^src=/i.test(item))[0];

	var replacement = (match, sub) => {
		sub = sub.trim();
		var isDataURI = sub.slice(0, 5) === 'data:';
		var protocol = url.parse(sub).protocol;
		var isAbsolutePath = sub[0] === '/';
		var isVmVar = /[$<{]/.test(sub[0]);
		if(isDataURI || protocol || isAbsolutePath || isVmVar) {
			return match;
		}

		return 'src="' + this.resolvePath(file, sub) + '"';
	};

	if(/^src="/i.test(src)) {
		match = match.replace(/\bsrc="([^"]+)"/i, replacement);
	} else if(/^src='/i.test(src)) {
		match = match.replace(/\bsrc='([^']+)'/i, replacement);
	} else if(/^src=(?!["'])/i.test(src)) {
		match = match.replace(/\bsrc=([^\s\\>]+)/i, replacement);
	}
	return match;
};

Dev.prototype.replaceData = function(attrs, match, file) {
	var src = attrs.filter(item => /^data=/i.test(item))[0];

	var replacement = (match, sub) => {
		var protocol = url.parse(sub).protocol;
		if(protocol === null) {
			return 'data="' + this.resolvePath(file, sub) + '"';
		}

		return match;
	};

	if(/^data="/i.test(src)) {
		match = match.replace(/\bdata="([^"]+)"/i, replacement);
	} else if(/^data='/i.test(src)) {
		match = match.replace(/\bdata='([^']+)'/i, replacement);
	} else if(/^data=(?!["'])/i.test(src)) {
		match = match.replace(/\bdata=([^\s\\>]+)/i, replacement);
	}
	return match;
};

Dev.prototype.replaceSrcset = function(match, srcList, file) {
	srcList.forEach(src => {
		var isDataURI = src.slice(0, 5) === 'data:';
		var protocol = url.parse(src).protocol;
		var isAbsolutePath = src[0] === '/';
		var isVmVar = /[$<{]/.test(src[0]);
		if(isDataURI || protocol || isAbsolutePath || isVmVar) {
			return;
		}
		match = match.replace(src, this.resolvePath(file, src));		
	});
	return match;
};

Dev.prototype.replaceUrl = function(match, sub, file) {
	sub = sub.trim();
	var isDataURI = sub.slice(0, 5) === 'data:';
	var protocol = url.parse(sub).protocol;
	var isAbsolutePath = sub[0] === '/';
	var isVmVar = /[$<{]/.test(sub[0]);
	if(isDataURI || protocol || isAbsolutePath || isVmVar) {
		return match;
	}

	return match.replace(sub, this.resolvePath(file, sub));
};

Dev.prototype.js = function(callback) {
	if(util.hasAMD(this.project)) {
	    var tasks = [
	    	amd.optimize.bind(this),
	    	amd.copy.bind(this),
	    	amd.updateConfig.bind(this)
	    ];
	    async.waterfall(tasks, callback);
	} else {
		callback();
	}
};

var amd = {};

amd.optimize = function optimize(callback) {
	var optimizerPath = path.join(__dirname, '../node_modules/requirejs/bin/r.js');
	try {
		fs.accessSync(optimizerPath);
	} catch(err) {
		optimizerPath = path.join(__dirname, '../../requirejs/bin/r.js');
	}
	var command = ['node', optimizerPath, '-o',
					util.getAMDBuildPath(this.project), 
					'inlineText=true', 'optimize=none', 'optimizeCss=none'
				].join(' ');
    exec(command, {cwd: this.src}, callback);
};

amd.copy = function () {
	var done = arguments[arguments.length - 1];
	var newPaths = {};
	var output = util.getAMDOutputPath(this.project);
	var configPathRelative = path.relative(this.src, util.getAMDConfigPath(this.project));
	var configDir = path.dirname(path.join(output, configPathRelative));
    var publicPath = util.getProjectPublicPath(this.project, 'development');

	gulp.src('**/*.js', {
		cwd: output
	})
	.pipe(plumber(function (err) {
        debug('出错 第%d行: %s', err.lineNumber, err.message);
        this.emit('end');
    }))
    .pipe(gulpFilter(this.filterList))
    .pipe(through2.obj((file, enc, cb) => {
		file = new File(file);

		if(file.isNull()) {		
            return cb(null, file);		
        }

		var filePath = path.relative(configDir, file.path);
		var newFilePath = url.resolve(publicPath, file.relative);
		var key = filePath.endsWith('.js') ? filePath.slice(0, -3) : filePath;
		var dest = newFilePath.slice(0, -3);
		newPaths[key] = dest;
		cb(null, file);
	}))
	.pipe(gulp.dest(this.destStatic))
	.pipe(util.taskDone(() => done(null, newPaths)));
};

amd.updateConfig = function (newPaths, done) {
	gulp.src(util.getAMDConfigPath(this.project), {
		base: this.src,
		cwd: this.src
	})
	.pipe(plumber(function (err) {
        debug('出错 第%d行: %s', err.lineNumber, err.message);
        this.emit('end');
    }))
	.pipe(through2.obj((file, enc, cb) => {
		file = new File(file);

		if(file.isNull()) {		
            return cb(null, file);		
        }
        
		var contents = file.contents.toString();
		var result = util.replaceConfigPaths(contents, newPaths);
		file.contents = new Buffer(result);
		cb(null, file);
	}))
	.pipe(gulp.dest(this.destStatic))
	.pipe(util.taskDone(done));
};

Dev.prototype.html = function(done) {
	debug('html');
	var dev = this;
	var src = common.getCwd(dev.project.repo, 'src');
	var destRoot = common.getCwd(dev.project.repo, 'development');
	var dest = path.join(destRoot, 'vm');
	var ignoreList = util.getIgnore(src);
	var filterList = util.getVmFileType().concat(ignoreList);
	
	console.log(colors.green('输出html：' + dest));
	gulp.src('**/*', {
		cwd: src
	})
	.pipe(gulpFilter(filterList))
	.pipe(through2.obj(util.replacePath(dev, 'development'))) // 替换静态资源链接
	.pipe(gulp.dest(dest))
	.pipe(util.taskDone(done));
};

Dev.prototype.run = function(commit, callback) {
	var checkout = done => {
		util.getProject(this.project, commit, done);
	};

	var compile = done => {
		var tasks = [
			this.resource.bind(this),
            util.jsnext.bind(null, this.project),
			this.js.bind(this),
			this.html.bind(this)
		];
		async.series(tasks, done);
	};

	async.series([util.clean(this.destRoot), checkout, compile], callback);
};

module.exports = Dev;