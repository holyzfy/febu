var common = require('../module/common.js');
var path = require('path');
var fs= require('fs');
var expect = require('expect.js');

describe(__filename, function(){
	var repo = 'https://github.com/holyzfy/trygit';

	it('getPathname', function(){
		var pathname = common.getPathname(repo);
		expect(pathname).to.be('holyzfy_trygit');
	});

	it('getCwd', function(done){
		var local = common.getCwd(repo, 'src');
		var gitDir = path.join(local, '.git');
		fs.exists(gitDir, function(ret) {
			expect(ret).to.be.ok();
			done();
		});
	});
});