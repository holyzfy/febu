var fs = require('fs');
var path = require('path');
var should = require('should');
var async = require('async');
var util = require('../module/util.js');
var common = require('../module/common.js');
var config = require('../config.js');
var Git = require('../module/git.js');

describe(__filename, function(){
	var repo = 'https://github.com/holyzfy/trygit';

	it('isEmpty: 文件存在', function(done) {
		var local = common.getCwd(repo, 'src');
		util.isEmpty(local, function(ret){
			ret.should.be.false;
			done();
		});
	});

	it('isEmpty: 文件不存在', function(done) {
		var fold = path.resolve(__dirname, '_not_exsited');
		util.isEmpty(fold, function(ret){
			ret.should.be.true;
			done();
		});
	});

	it('formatCommit', function(done) {
		async.series([
			function(callback){
				var commit = '3bc6453';
				util.formatCommit(repo, commit, function(err, data) {
					if(err) {
						return callback(err);
					}
					commit.should.equal(data);
					callback();
				});
			},
			function(callback) {
				util.formatCommit(repo, 'HEAD', callback);
			}
		], done);
	});

	it('getProject', function(done) {
		var commit = 'HEAD';
		util.getProject({repo: repo}, commit, done);
	});

	it('getSource', function(done) {
		async.series([
			function(callback) {
				util.getSource({repo: repo}, 'HEAD', callback);
			},
			function(callback){
				var project = {
					repo: repo,
					version: '3bc6453'
				};
				util.getSource(project, '00ce303', function(err, data){
					if(err) {
						return callback(err);
					}
					try {
						data.should.be.Array;
						data.should.have.length(2);
					} catch(e) {
						callback(e);
					}
					callback();
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
			repo: 'https://bitbucket.org/holyzfy/tianchuang'
		};
		var git = new Git(project.repo);
		git.clone(function() {
			var src = common.getCwd(project.repo, 'src');
			var configPath = path.join(src, 'www/js/config.js');

			util.getConfigPath(project, function(err, path) {
				if(err) {
					return done(err);
				}
				path.should.be.equal(configPath);
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

});