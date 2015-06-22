var common = require('../module/common.js');
var path = require('path');
var fs= require('fs');
var should = require('should');

describe(__filename, function(){
	var repo = 'https://github.com/holyzfy/trygit';

	it('getPathname', function(){
		var pathname = common.getPathname(repo);
		pathname.should.equal('holyzfy_trygit');
	});

	it('getCwd', function(done){
		var local = common.getCwd(repo, 'src');
		var gitDir = path.join(local, '.git');
		fs.exists(gitDir, function(ret) {
			should.exist(ret);
			done();
		});
	});
});