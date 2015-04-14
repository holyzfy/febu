var path = require('path');
var mocha = require('mocha');
var assert = require("assert");
var Git = require('../module/git.js');
var debug = require('debug')('febu:' + __filename);
var fs = require('fs');
var should = require('should');

describe(__filename, function(){
	describe('Git.prototype.clone', function(){
		var repo = 'https://github.com/holyzfy/trygit';
		var git = new Git(repo);

		it('取得仓库地址', function(){
			repo.should.equal(git.url);
		});

		/*it('克隆仓库成功', function(done){
			git.clone(function(err){
				should.not.exist(err);
				var local = Git.getCwd(repo);
				var gitDir = path.join(local, '.git');
				fs.readdir(gitDir, function(err, files) {
					should.exist(files);
					done();
				});
			});
		});*/

		it('取得本地仓库的根目录', function(done){
			var local = Git.getCwd(repo);
			var gitDir = path.join(local, '.git');
			fs.exists(gitDir, function(ret) {
				should.exist(ret);
				done();
			});
		});

		it('查询日志', function(done){
			var commit = '7b11df0';
			git.options.cwd = Git.getCwd(repo);
			git.show(commit, function(err, ret){
				var expected = {
					commit: commit,
					author: 'zfq',
					datetime: 1400251035000,
					message: '添加images'
				};

				should.deepEqual(ret, expected);
				done();
			});
		});

	});
});