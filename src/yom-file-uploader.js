var $ = window.jQuery || window.$;

function _simulateProgress(lastProgress, startTime, callback) {
	var interval = 3000;
	var step = parseInt(5 + Math.random() * 3);
	if(lastProgress > 50) {
		interval += 2000;
		step -= 2;
	} else if(lastProgress > 80) {
		interval += 4000;
		step -= 4;
	}
	setTimeout(function() {
		callback(Math.min(lastProgress + step, 99));
	}, interval);
};

var _uploadingCount = 0;

var Uploading = function(id, fileName, from, fileSize) {
	this.id = id;
	this.from = from;
	this.fileSize = fileSize;
	this.fileName = fileName.replace(/\\/g, '/').split('/').pop();
	this.fileExtName = this.fileName.split('.').pop();
	if(this.fileExtName == this.fileName) {
		this.fileExtName = '';
	} else {
		this.fileExtName = '.' + this.fileExtName.toLowerCase();
	}
};

/**
 * @class
 * @param {String|DOM|jQuery Instance} holder the holder for placing uploader
 * @param {Object} opt the optional parameter object
 * {
 * 	inputHolder: {String|DOM|jQuery Instance}
 * 	enableMultipleSelection: {Boolean} whether enable multiple selection in file browser or droping files, default is false
 * 	enableDropFile: {Boolean} whether enable drop file upload if file API available, default is false
 * 	enableFileBrowser: {Boolean} whether popup file browser while user clicking the uploader area, default is true
 * 	url: {String}
 * 	progressGetter: {Function}
 * 	progressInterval: {Number}
 * 	onProgress: {Function}
 * 	onLoad: {Function}
 * 	onError: {Function}
 * }
 */
var FileUploader = function(holder, opt) {
	var self = this;
	opt = opt || {};
	this._opt = opt;
	this._holder = $(holder);
	this._area = null;
	this._fileInput = null;
	this._enableMultipleSelection = !!opt.enableMultipleSelection;
	this._enableDropFile = opt.enableDropFile !== false;
	this._enableFileBrowser = opt.enableFileBrowser !== false;
	this._url = opt.url || '';
	this._fileParamName = opt.fileParamName || 'file';
	this._onBeforeUpload = opt.onBeforeUpload || this._onBeforeUpload;
	this._toBeUploaded = null;
	this._uploadings = [];
	this._bind = {
		click: function(evt) {return self._onClick(evt);},
		dragover: function(evt) {return self._onDragover(evt);},
		dragenter: function(evt) {return self._onDragenter(evt);},
		dragleave: function(evt) {return self._onDragleave(evt);},
		drop: function(evt) {return self._onDrop(evt);},
		fileChange: function(evt) {return self._onFileChange(evt);},
		fileClick: function(evt) {return self._onFileClick(evt);}
	};
	this._init();
};

FileUploader.dropFileSupported = 'File' in window && 'FormData' in window;

$.extend(FileUploader.prototype, {
	_init: function() {
		if(this._holder.length) {
			this._area = $([
				'<div style="position: absolute; left: 0; top: 0; width: 100%; height: 100%; padding: 0; margin: 0; overflow: hidden; background-image: url(about:blank);">',
				'</div>'
			].join('')).appendTo(this._holder);
			this._holder.css({position: 'relative'});
			this._enableFileBrowser && this._createFileInput();
			this._bindEvent();
		}
	},

	_onClick: function(evt) {
		if(this._fileInput && evt.target != this._fileInput[0]) {
			this._fileInput[0].click();
		}
	},

	_onDragover: function(evt) {
		evt.preventDefault();
	},

	_onDragenter: function(evt) {
		evt.preventDefault();
		if(this._opt.onDragenter) {
			this._opt.onDragenter(evt);
		}
	},

	_onDragleave: function(evt) {
		if(this._opt.onDragleave) {
			this._opt.onDragleave(evt);
		}
	},

	_onDrop: function(evt) {
		evt.preventDefault();
		var files = evt.originalEvent.dataTransfer.files;
		if(this._opt.onPreview) {
			this._toBeUploaded = {
				files: files
			};
			this._opt.onPreview(this._toBeUploaded);
		} else {
			this.uploadByDropFile(files);
		}
		if(this._opt.onDrop) {
			this._opt.onDrop(evt);
		}
	},

	_onFileChange: function(evt) {
		var fileInput = this._removeFileInput();
		this._createFileInput();
		if(this._enableDropFile && FileUploader.dropFileSupported) {
			var files = fileInput[0].files;
			if(this._opt.onPreview) {
				this._toBeUploaded = {
					files: files
				};
				this._opt.onPreview(this._toBeUploaded);
			} else {
				this.uploadByDropFile(files);
			}
		} else {
			if(this._opt.onPreview) {
				this._toBeUploaded = {
					fileInput: fileInput
				};
				this._opt.onPreview(this._toBeUploaded);
			} else {
				this.uploadByFileInput(fileInput);
			}
		}
	},

	_onFileClick: function(evt) {
		if(!window.ActiveXObject) {
			return;
		}
		var target = evt.target;
		var fileClick = this._bind.fileClick;
		setTimeout(function() {
			$(target).off('click', fileClick);
			target.click();
			$(target).on('click', fileClick);
		}, 0);
	},

	_bindEvent: function() {
		this._area.on('click', this._bind.click);
		if(this._enableDropFile && FileUploader.dropFileSupported) {
			this._area.on('dragover', this._bind.dragover);
			this._area.on('dragenter', this._bind.dragenter);
			this._area.on('dragleave', this._bind.dragleave);
			this._area.on('drop', this._bind.drop);
		}
	},

	_unbindEvent: function() {
		this._area.off('click', this._bind.click);
		if(this._enableDropFile && FileUploader.dropFileSupported) {
			this._area.off('dragover', this._bind.dragover);
			this._area.off('dragenter', this._bind.dragenter);
			this._area.off('dragleave', this._bind.dragleave);
			this._area.off('drop', this._bind.drop);
		}
	},

	_createFileInput: function() {
		this._removeFileInput();
		this._fileInput = $([
			'<input type="file" ',
				'name="' + this._fileParamName + '" ',
				this._enableMultipleSelection && FileUploader.dropFileSupported ? 'multiple' : 'single',
			' />'
		].join(''));
		this._fileInput.css({
			border: window.ActiveXObject ? 'solid 2000px #000' : 'none',
			position: 'absolute',
			right: '0',
			top: '0',
			width: '4000px',
			height: '4000px',
			padding: '0',
			margin: '0',
			cursor: 'pointer',
			overflow: 'hidden',
			opacity: '0',
			filter: 'Alpha(Opacity="0")'
		});
		this._fileInput.on('change', this._bind.fileChange).on('click', this._bind.fileClick);
		this._fileInput.appendTo(this._opt.inputHolder || this._area);
	},

	_removeFileInput: function() {
		var res;
		if(!this._fileInput) {
			return;
		}
		this._fileInput.off('change', this._bind.fileChange);
		res = this._fileInput.remove();
		this._fileInput = null;
		return res;
	},

	_getNewUploading: function(fileName, from, fileSize) {
		var id = _uploadingCount++;
		var uploading = new Uploading(id, fileName, from, fileSize);
		return uploading;
	},

	_removeUploading: function(uploading) {
		var uploadings = this._uploadings;
		if(uploadings) {
			for(var i = 0; i < uploadings.length; i++) {
				if(uploadings[i].id == uploading.id) {
					return uploadings.splice(i, 1);
				}
			}
		}
	},

	_onBeforeUpload: function(uploading, callback) {
		callback({});
	},

	_uploadOneDropFile: function(file) {
		var self = this;
		var onProgress = this._opt.onProgress;
		var onLoad = this._opt.onLoad;
		var onError = this._opt.onError;
		var onComplete = this._opt.onComplete;
		var uploading = this._getNewUploading(file.name, 'DROP', file.size);
		this._onBeforeUpload(uploading, function(feedback) {
			var form, url;
			if(feedback === false) {
				return;
			}
			feedback = feedback || {};
			self._uploadings.push(uploading);
			url = feedback.url || self._url;
			form = new FormData();
			form.append(self._fileParamName, file);
			if(feedback.data) {
				$.each(feedback.data, function(key, val) {
					form.append(key, val);
				});
			}
			(feedback.xhrGetter || function(callback) {callback();})(function(xhr, headers) {
				xhr = xhr || new XMLHttpRequest();
				xhr.onload = function() {
					var res;
					if(onLoad) {
						try {
							if('JSON' in window) {
								res = JSON.parse(xhr.responseText);
							} else {
								res = eval('(' + xhr.responseText + ')');
							}
						} catch(e) {
							if(onError) {
								onError(uploading);
							}
							return;
						}
						onLoad(uploading, res);
					}
				};
				xhr.onerror = function() {
					if(onError) {
						onError(uploading);
					}
				};
				xhr.onloadend = function() {
					self._removeUploading(uploading);
					onComplete && onComplete(uploading);
				};
				var progress = 0;
				if(onProgress) {
					xhr.upload.onprogress = function(evt) {
						if(evt.loaded > 0 && evt.total > 0) {
							progress = Math.min(parseInt(evt.loaded / evt.total * 100), 100);
						}
						onProgress(uploading, progress);
					};
				}
				xhr.open('post', url, true);
				if(headers) {
					for(var key in headers) {
						if(headers.hasOwnProperty(key)) {
							xhr.setRequestHeader(key, headers[key]);
						}
					}
				}
				xhr.withCredentials = true;
				uploading.abort = function() {
					xhr.abort();
					uploading.abort = function() {};
				};
				xhr.send(form);
				progress || onProgress && onProgress(uploading, progress);
			});
		});
	},
	
	upload: function() {
		if(this._toBeUploaded) {
			if(this._toBeUploaded.files) {
				this.uploadByDropFile(this._toBeUploaded.files);
			} else if(this._toBeUploaded.fileInput) {
				this.uploadByFileInput(this._toBeUploaded.fileInput);
			}
			this._toBeUploaded = null;
		}
	},

	uploadByDropFile: function(files) {
		var self = this;
		$.each(files, function(i, file) {
			self._uploadOneDropFile(file);
			if(!self._enableMultipleSelection) {
				return false;
			}
		});
	},

	uploadByFileInput: function(fileInput) {
		var self = this;
		var progressGetter = this._opt.progressGetter;
		var progressInterval = this._opt.progressInterval || 5000;
		var onProgress = this._opt.onProgress;
		var onLoad = this._opt.onLoad;
		var onError = this._opt.onError;
		var onComplete = this._opt.onComplete;
		var uploading = this._getNewUploading(fileInput.val(), 'INPUT');
		this._onBeforeUpload(uploading, function(feedback) {
			var form, iframe, iframeName, url;
			if(feedback === false) {
				return;
			}
			self._uploadings.push(uploading);
			url = feedback && feedback.url || self._url;
			iframeName = 'file-uploader-iframe-' + uploading.id;
			iframe = $('<iframe name="' + iframeName + '" style="display: none;"></iframe>').appendTo(document.body)[0];
			iframe.callback = function(res) {
				clear();
				if(onLoad) {
					onLoad(uploading, res);
				}
			};
			iframe.onload = function() {
				if(iframe) {
					clear();
					onError && onError(uploading);
				}
			};
			form = $('<form target="' + iframeName + '" action="' + url + '" method="post" enctype="multipart/form-data"></form>').appendTo(document.body);
			form.append(fileInput);
			if(feedback && feedback.data) {
				$.each(feedback.data, function(key, val) {
					form.append($('<input type="hidden" name="' + key + '" value="' + val + '" />'));
				});
			}
			uploading.abort = function() {
				clear();
				uploading.abort = function() {};
			};
			form[0].submit();
			if(onProgress) {
				iframe && onProgress(uploading, 0);
				if(progressGetter) {
					setTimeout(function getProgress() {
						iframe && progressGetter(uploading, function(progress) {
							if(iframe) {
								onProgress(uploading, progress);
								setTimeout(getProgress, progressInterval);
							}
						});
					}, progressInterval);
				} else {
					(function simulateProgress(lastProgress, startTime) {
						_simulateProgress(lastProgress, startTime, function(progress) {
							if(iframe) {
								onProgress(uploading, progress);
								simulateProgress(progress, startTime);
							}
						});
					})(0, new Date());
				}
			}
			function clear() {
				if(!iframe) {
					return;
				}
				var $iframe = $(iframe);
				self._removeUploading(uploading);
				iframe.callback = null;
				iframe.onload = null;
				setTimeout(function() {
					$iframe.remove();
				}, 200);
				form.remove();
				iframe = null;
				form = null;
				onComplete && onComplete(uploading);
			};
		});
	},

	destroy: function() {
		this._unbindEvent();
		this._removeFileInput();
		this._area.remove();
		this._holder = null;
		this._area = null;
		this._fileInput = null;
		this._toBeUploaded = null;
		this._onBeforeUpload = null;
		$.each(this._uploadings, function(i, uploading) {
			uploading.abort();
		});
		this._uploadings = null;
	}
});

module.exports = FileUploader;
