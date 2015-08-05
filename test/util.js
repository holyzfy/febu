var fs = require('fs-extra');
var path = require('path');
var should = require('should');
var async = require('async');
var File = require('vinyl');
var fs = require('fs-extra')
var util = require('../module/util.js');
var common = require('../module/common.js');
var config = require('../config.js');
var Git = require('../module/git.js');

describe(__filename, function(){
	var repo = 'https://github.com/holyzfy/trygit';

	before(function() {
		var repo, git;
		repo = 'https://github.com/holyzfy/trygit';
		git = new Git(repo);
		fs.removeSync(git.options.cwd);

		repo = 'https://github.com/requirejs/example-multipage';
		git = new Git(repo);
		fs.removeSync(git.options.cwd);
	});

	it('isEmpty: 文件存在', function(done) {
		var src = path.join(__dirname, '_a_test_path');
		fs.mkdirsSync(src);
		fs.writeFileSync(path.join(src, 'note.txt'), 'hello');
		util.isEmpty(src, function(ret){
			ret.should.be.false;
			fs.remove(src, done);
		});
	});

	it('isEmpty: 文件不存在', function(done) {
		var fold = path.resolve(__dirname, '_not_exsited');
		util.isEmpty(fold, function(ret){
			ret.should.be.true;
			done();
		});
	});

	it('getProject', function(done) {
		var commit = 'HEAD';
		util.getProject({repo: repo}, commit, done);
	});

	it('formatCommit', function(done) {
		async.series([
			function(callback){
				var commit = '3bc6453272bdf9e0acfc8099a0f9cd3c07d3a8e4';
				var commitExpected = '3bc6453';
				util.formatCommit(repo, commit, function(err, data) {
					if(err) {
						return callback(err);
					}
					data.should.equal(commitExpected);
					callback();
				});
			},
			function(callback) {
				util.formatCommit(repo, 'HEAD', function(err, commit) {
					commit.should.have.length(7);
					callback(err);
				});
			}
		], done);
	});

	it('resolvePath', function(){
		var from = 'd:/febu/data/src/github.com/test/index.html';
		var to = 'style/list.css';
		var base = 'd:/febu/data/src/github.com/test';

		var ret = util.resolvePath(from, to, base);
		should.equal(path.normalize(ret), path.normalize(to));
	});

	it('getConfigPath', function(done) {
		var project = {
			repo: 'https://github.com/requirejs/example-multipage'
		};
		var git = new Git(project.repo);
		git.clone(function() {
			var src = common.getCwd(project.repo, 'src');
			var configPath = path.join(src, 'www/js/common.js');

			util.getConfigPath(project, function(err, path) {
				if(err) {
					return done(err);
				}
				should.equal(path, configPath);
				done();
			});
		});
	});

	it('replaceConfigPaths', function() {
		var contents = "  require({baseUrl: 'js', paths: {'jquery': 'lib/jquery'}, shim: {'highcharts': ['jquery'] } }); ";
		var newPaths = {
			jquery: '//code.jquery.com/jquery-1.11.3.min'
		};
		var newContents = util.replaceConfigPaths(contents, newPaths);
		newContents.should.startWith("require.config(");
		newContents.indexOf('lib/jquery').should.below(0);
		newContents.indexOf('//code.jquery.com/jquery-1.11.3.min').should.above(-1);
		newContents.should.endWith(");");
	});
	
	it('hasAMD', function(done) {
		var project = {
			repo: 'https://github.com/requirejs/example-multipage'
		};
		util.hasAMD(project, function(err, exist){
			exist.should.be.true;
			done(err);
		});
	});

	it('relPath', function() {
		var css = new File({
			base: '/febu/data_temp/test_project',
			path: '/febu/data_temp/test_project/style/sub_xxx/login.css'
		});
		var imagePath = '../../images/sub_xxx/btn.png';
		var cssRet = util.relPath(css, imagePath);
		var cssExpected = ['images', 'sub_xxx', 'btn.png'].join(path.sep);
		cssRet.should.equal(cssExpected);

		var html = new File({
			base: '/febu/data_temp/test_project',
			path: '/febu/data_temp/test_project/www/inc/head_static.html'
		});
		var jsPath = 'js/config.js';
		var htmlRet = util.relPath(html, jsPath);
		var htmlExpected = ['js', 'config.js'].join(path.sep);
		htmlRet.should.equal(htmlExpected);

		var html2 = new File({
			base: '/febu/data_temp/test_project',
			path: '/febu/data_temp/test_project/www/module/nav.html'
		});
		var jsPath2 = '../js/nav.js';
		var htmlRet2 = util.relPath(html2, jsPath2);
		var htmlExpected2 = ['www', 'js', 'nav.js'].join(path.sep);
		htmlRet2.should.equal(htmlExpected2);
	});

});