var path = require('path');
var mocha = require('mocha');
var assert = require("assert");
var Git = require(path.resolve(__dirname, '../module/git.js'));

describe(__filename, function(){
	describe('Git.prototype.clone', function(){
		var repo = 'https://github.com/holyzfy/trygit';
		var git = new Git(repo);

		it('取得仓库地址', function(){
			assert.equal(repo, git.url);
		});

		it('克隆仓库成功', function(done){
			var git = new Git('https://github.com/holyzfy/trygit');
			git.clone(function(err){
				if(err) throw err;
				done();
			});
		});
	});
});