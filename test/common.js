var path = require('path');
var fs= require('fs');
var expect = require('expect.js');
var fs = require('fs-extra');
var Git = require('../module/git.js');
var common = require('../module/common.js');

describe(__filename, function(){
	var repo = 'https://github.com/holyzfy/trygit';

	it('getPathname', function(){
		var pathname = common.getPathname(repo);
		expect(pathname).to.be('holyzfy_trygit');
	});

	it('getCwd', function(done){
		var git = new Git(repo);
		git.clone(function(err) {
			if(err) {
				return done(err);
			}

			var local = common.getCwd(repo, 'src');
			var gitDir = path.join(local, '.git');
			fs.exists(gitDir, function(ret) {
				expect(ret).to.be.ok();
				fs.remove(local, done);
			});
			
		});

	});
});