var path = require('path');
var mocha = require('mocha');
var Git = require('../module/git.js');
var debug = require('debug')('febu:' + __filename);
var fs = require('fs');
var should = require('should');

describe(__filename, function(){
	var repo = 'https://github.com/holyzfy/trygit';
	var git = new Git(repo);

	it('取得仓库地址', function(){
		repo.should.equal(git.url);
	});

	it('克隆仓库成功', function(done){
		git.clone(done);
	});

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

			try {
				should.not.exist(err);
				should.deepEqual(ret, expected);
				done();
			} catch(err) {
				done(err);
			}
		});
	});

	it('从远程仓库拉取当前分支', function(done){
		git.pull(done);
	});

	it('切换到master分支', function(done){
		git.checkout('master', done);
	});

	it('比较两次提交的差异', function(done){
		var from = 'eae17bd';
		var to = '0b6d734';
		var expected = [
		    'images/174338a0ay2nnznr3fv116.jpg',
		    'images/logo_107.gif',
		    'images/yoko_ogura.jpg',
		    'index.html',
		    'list.html'
		];
		git.diff(from, to, function(err, data){
			try {
				// debug(data);
				should.deepEqual(data, expected);
				done();
			} catch(e) {
				done(e);
			}
		});
	});
});