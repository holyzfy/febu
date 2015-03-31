/**
 * @constructor
 * @param {String} rep 仓库地址
 */
function Git(rep) {
	
}

/**
 * 拉取远程分支
 * @return {Promise}
 */
Git.prototype.pull = function(){
	
};

/**
 * 切换分支
 * @param  {String} branch 分支名
 * @return {Promise}        
 */
Git.prototype.checkout = function(branch){

};

/**
 * 查询日志
 * @param  {String} commit 版本号
 * @return {Promise}        
 */
Git.prototype.log = function(commit) {
	
};

/**
 * 比较两次提交的差异
 * @param  {String} from 版本号
 * @param  {String} to   版本号
 * @return {Promise}     
 */
Git.prototype.diff = function(from, to) {

};