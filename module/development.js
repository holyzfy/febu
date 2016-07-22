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
var del = require('del');
var util = require('./util.js');
var common = require('./common.js');

function Dev(project) {
	this.project = project;
}

// 收集静态资源
Dev.prototype.resource = function(files, callback) {
	debug('resource');
	var dev = this;
	var src = common.getCwd(dev.project.repo, 'src');
	var destRoot = common.getCwd(dev.project.repo, 'development');
	var destStatic = path.join(destRoot, 'static');
	var ignoreList = util.getIgnore(src);
	var filterList = util.getStaticFileType().concat(ignoreList);
	console.log(colors.green('输出静态资源：' + destStatic));
	gulp.src(files, {
		base: src
	})
	.on('end', callback)
	.pipe(plumber(function (err) {
        debug('出错 第%d行: %s', err.lineNumber, err.message);
        this.emit('end');
    }))
	.pipe(gulpFilter(filterList))
	.pipe(gulp.dest(destStatic));
};

Dev.prototype.replaceHref = function(attrs, match, file) {
	var dev = this;
	var href = attrs.filter(function(item){
		return /^href=/i.test(item);
	})[0];

	function replacement(match, sub) {
		var protocol = url.parse(sub).protocol;
		var isAbsolutePath = sub[0] === '/';
		var isVmVar = /[$<{]/.test(sub[0]);
		if(protocol || isAbsolutePath || isVmVar) {
			return match;
		}

		var subPath = util.relPath(file, sub);
		var publicPath = util.getProjectPublicPath(dev.project, 'development');
		var newHref = url.resolve(publicPath, subPath);
		return 'href="' + newHref + '"';
	}

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
	var dev = this;

	var filePath = file.path.replace(new RegExp('\\' + path.sep, 'g'), '/');
	var inc = '/inc/';
	var hasInc = filePath.lastIndexOf(inc) > 0;

	// 约定：inc目录的静态资源路径相对于根目录
	var relativeDir = hasInc ? '' : file.relative.slice(0, 0 - file.basename.length);

	var publicPath = util.getProjectPublicPath(dev.project, 'development');
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
	var dev = this;
	var src = attrs.filter(function(item){
		return /^src=/i.test(item);
	})[0];

	function replacement(match, sub) {
		sub = sub.trim();
		var isDataURI = sub.slice(0, 5) === 'data:';
		var protocol = url.parse(sub).protocol;
		var isAbsolutePath = sub[0] === '/';
		var isVmVar = /[$<{]/.test(sub[0]);
		if(isDataURI || protocol || isAbsolutePath || isVmVar) {
			return match;
		}

		return 'src="' + dev.resolvePath(file, sub) + '"';
	}

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
	var dev = this;
	var src = attrs.filter(function(item){
		return /^data=/i.test(item);
	})[0];

	function replacement(match, sub) {
		var protocol = url.parse(sub).protocol;
		if(protocol === null) {
			return 'data="' + dev.resolvePath(file, sub) + '"';
		}

		return match;
	}

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
	var dev = this;

	srcList.forEach(function(src) {
		var isDataURI = src.slice(0, 5) === 'data:';
		var protocol = url.parse(src).protocol;
		var isAbsolutePath = src[0] === '/';
		var isVmVar = /[$<{]/.test(src[0]);
		if(isDataURI || protocol || isAbsolutePath || isVmVar) {
			return;
		}
		match = match.replace(src, dev.resolvePath(file, src));		
	});
	return match;
};

Dev.prototype.replaceUrl = function(match, sub, file) {
	var dev = this;
	sub = sub.trim();
	var isDataURI = sub.slice(0, 5) === 'data:';
	var protocol = url.parse(sub).protocol;
	var isAbsolutePath = sub[0] === '/';
	var isVmVar = /[$<{]/.test(sub[0]);
	if(isDataURI || protocol || isAbsolutePath || isVmVar) {
		return match;
	}

	return match.replace(sub, dev.resolvePath(file, sub));
};

Dev.prototype.js = function(files, callback) {
	debug('js', arguments);
	var dev = this;
	var src = common.getCwd(dev.project.repo, 'src');
	var base = src;
	var destRoot = common.getCwd(dev.project.repo, 'development');
	var destStatic = path.join(destRoot, 'static');
	var ignoreList = util.getIgnore(base);
	var filterList = util.getStaticFileType().concat(ignoreList);

	function amdAction(done) {
		debug('amdAction', arguments);
		
		var hasJsFiles = files.some(function(item) {
			return (item === '**/*') || item.endsWith('.js');
		});
		if(!hasJsFiles) {
			debug('本次无变更的js');
			return done();
		}

		var newPaths = {};

		function optimize(cb) {
			debug('js:optimize', arguments);
			var optimizerPath = path.join(__dirname, '../node_modules/requirejs/bin/r.js');
			try {
				fs.accessSync(optimizerPath);
			} catch(err) {
				optimizerPath = path.join(__dirname, '../../requirejs/bin/r.js');
			}
			var command = ['node', optimizerPath, '-o',
							util.getAMDBuildPath(dev.project), 
							'inlineText=true', 'optimize=none', 'optimizeCss=none'
						].join(' ');
	        exec(command, {cwd: src}, cb);
	    }

	    function copy() {
	    	debug('js:copy');
	    	var next = arguments[arguments.length - 1];

    		var output = util.getAMDOutputPath(dev.project);
    		var configPathRelative = path.relative(src, util.getAMDConfigPath(dev.project));
    		var configDir = path.dirname(path.join(output, configPathRelative));
		    var publicPath = util.getProjectPublicPath(dev.project, 'development');

			gulp.src('**/*.js', {
				base: output,
    			cwd: output
    		})
			.on('end', next)
			.pipe(plumber(function (err) {
	            debug('出错 第%d行: %s', err.lineNumber, err.message);
	            this.emit('end');
	        }))
	        .pipe(gulpFilter(filterList))
	        .pipe(through2.obj(function (file, enc, cb) {
				file = new File(file);

				if(file.isNull()) {		
		            return cb(null, file);		
		        }

				var filePath = path.relative(configDir, file.path);
				var newFilePath = url.resolve(publicPath, file.relative);
				var key = filePath.slice(-3) === '.js' ? filePath.slice(0, -3) : filePath;
	    		var dest = newFilePath.slice(0, -3);
	    		newPaths[key] = dest;
				cb(null, file);
			}))
			.pipe(gulp.dest(destStatic));
	    }

	    function updateConfig() {
	    	debug('js:updateConfig');
	    	var next = arguments[arguments.length - 1];

    		gulp.src(util.getAMDConfigPath(dev.project), {
	    		base: base
	    	})
			.on('end', next)
	    	.pipe(plumber(function (err) {
	            debug('出错 第%d行: %s', err.lineNumber, err.message);
	            this.emit('end');
	        }))
			.pipe(through2.obj(function (file, enc, cb) {
				file = new File(file);

				if(file.isNull()) {		
		            return cb(null, file);		
		        }
		        
				var contents = file.contents.toString();
				var result = util.replaceConfigPaths(contents, newPaths);
				file.contents = new Buffer(result);
				cb(null, file);
			}))
			.pipe(gulp.dest(destStatic));
	    }

	    async.series([optimize, copy, updateConfig], done);
	}

	function otherAction(done) {
		debug('otherAction');
		done();
	}

	util.hasAMD(dev.project) ? amdAction(callback) : otherAction(callback);
};

Dev.prototype.html = function(files, callback) {
	debug('html');
	var dev = this;
	var src = common.getCwd(dev.project.repo, 'src');
	var destRoot = common.getCwd(dev.project.repo, 'development');
	var dest = path.join(destRoot, 'vm');
	var ignoreList = util.getIgnore(src);
	var filterList = util.getVmFileType().concat(ignoreList);
	
	console.log(colors.green('输出html：' + dest));
	gulp.src(files, {
		base: src
	})
	.on('end', callback)
	.on('error', callback)
	.pipe(gulpFilter(filterList))
	.pipe(through2.obj(util.replacePath(dev, 'development'))) // 替换静态资源链接
	.pipe(gulp.dest(dest));
};

Dev.prototype.run = function(commit, callback) {
	var dev = this;

	// function clean(cb) {
	// 	var dist = common.getCwd(dev.project.repo, 'development');
	// 	fs.remove(dist, cb);
	// }

	function clean(done) {
		var dist = common.getCwd(dev.project.repo, 'development');
        del(dist, {
            force: true
        }).then(function() {
            done();
        });
	}

	function checkout(done) {
		debug('checkout:%s', commit);
		util.getProject(dev.project, commit, done);
	}

	function compile(done) {
		var files = ['**/*'];
		var tasks = [
			dev.resource.bind(dev, files),
			dev.js.bind(dev, files),
			dev.html.bind(dev, files)
		];
		async.series(tasks, done);
	};

	async.series([clean, checkout, compile], callback);
};

module.exports = Dev;