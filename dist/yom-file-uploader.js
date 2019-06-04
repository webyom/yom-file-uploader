(function (global, factory) {
	typeof exports === 'object' && typeof module !== 'undefined' ? module.exports = factory(require('jquery')) :
	typeof define === 'function' && define.amd ? define(['jquery'], factory) :
	(global.YomFileUploader = factory(global.$));
}(this, (function ($) { 'use strict';

$ = 'default' in $ ? $['default'] : $;

function getStringFromDataView(dataView, start, length) {
	var outstr = '';
	for(var n = start; n < start + length; n++) {
			outstr += String.fromCharCode(dataView.getUint8(n));
	}
	return outstr;
}

function readTags(dataView, tiffStart, dirStart, strings, bigEnd) {
	var entries = dataView.getUint16(dirStart, !bigEnd);
	var tags = {};
	for(var i = 0; i < entries; i++) {
		var entryOffset = dirStart + i * 12 + 2;
		var tag = strings[dataView.getUint16(entryOffset, !bigEnd)];
		if(!tag) {
			continue;
		}
		var type = dataView.getUint16(entryOffset + 2, !bigEnd);
		var numValues = dataView.getUint32(entryOffset + 4, !bigEnd);
		if(type === 3) {
			if(numValues === 1) {
				tags[tag] = dataView.getUint16(entryOffset + 8, !bigEnd);
			} else {
				var valueOffset = dataView.getUint32(entryOffset + 8, !bigEnd) + tiffStart;
				var offset = numValues > 2 ? valueOffset : (entryOffset + 8);
				var vals = [];
				for(var n = 0; n < numValues; n++) {
						vals[n] = dataView.getUint16(offset + 2 * n, !bigEnd);
				}
				tags[tag] = vals;
			}
		} else if(type === 4) {
			if(numValues == 1) {
				tags[tag] = dataView.getUint32(entryOffset + 8, !bigEnd);
			} else {
				var valueOffset = dataView.getUint32(entryOffset + 8, !bigEnd) + tiffStart;
				var vals = [];
				for(n = 0; n < numValues; n++) {
					vals[n] = dataView.getUint32(valueOffset + 4 * n, !bigEnd);
				}
				tags[tag] = vals;
			}
		}
	}
	return tags;
}

function getExifInfo(ab) {
	var tags = {};
	var dataView = new DataView(ab);
	if((dataView.getUint8(0) != 0xFF) || (dataView.getUint8(1) != 0xD8)) {
		return tags;
	}
	var offset = 2;
	var len = ab.byteLength;
	var marker;
	while(offset < len) {
		if(dataView.getUint8(offset) != 0xFF) {
			return tags;
		}
		marker = dataView.getUint8(offset + 1);
		if(marker == 0xE1) {
			offset += 4;
			if(getStringFromDataView(dataView, offset, 4) != 'Exif') {
				return tags;
			}
			var tiffOffset = offset + 6;
			var bigEnd;
			if(dataView.getUint16(tiffOffset) == 0x4949) {
				bigEnd = false;
			} else if(dataView.getUint16(tiffOffset) == 0x4D4D) {
				bigEnd = true;
			} else {
				return tags;
			}
			if(dataView.getUint16(tiffOffset + 2, !bigEnd) != 0x002A) {
				return tags;
			}
			var firstIFDOffset = dataView.getUint32(tiffOffset + 4, !bigEnd);
			if(firstIFDOffset < 0x00000008) {
				return tags;
			}
			tags = Object.assign(tags, readTags(dataView, tiffOffset, tiffOffset + firstIFDOffset, {0x0112 : 'orientation', 0x8769 : 'exifIFDPointer'}, bigEnd));
			if(tags.exifIFDPointer) {
				tags = Object.assign(tags, readTags(dataView, tiffOffset, tiffOffset + tags.exifIFDPointer, {0xA002 : 'width', 0xA003 : 'height'}, bigEnd));
				delete tags.exifIFDPointer;
			}
			return tags;
		} else {
			if(marker == 0xC0 || marker == 0xC2) {
				tags['height'] = dataView.getUint16(offset + 5);
				tags['width'] = dataView.getUint16(offset + 7);
			} else if(marker != 0xE0 && marker != 0xC4 && marker != 0xDB && marker != 0xFE) {
				return tags;
			}
			offset += 2 + dataView.getUint16(offset + 2);
		}
	}
}

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
}

var _uploadingCount = 0;

var Uploading = function(id, fileName, from, file) {
	this.id = id;
	this.from = from;
	this.file = file;
	this.fileSize = file && file.size;
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
 * 	onDragenter: {Function}
 * 	onDragleave: {Function}
 * 	onDrop: {Function}
 * 	onDropFile: {Function}
 * 	onBeforeUpload: {Function}
 * 	onProgress: {Function}
 * 	onLoad: {Function}
 * 	onError: {Function}
 * 	onComplete: {Function}
 * }
 */
var YomFileUploader = function(holder, opt) {
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
	this._pendingUploadings = [];
	this._concurrency = opt.concurrency > 0 ? opt.concurrency : this._enableMultipleSelection ? 10 : 1;
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

YomFileUploader.dropFileSupported = 'File' in window && 'FormData' in window;

$.extend(YomFileUploader.prototype, {
	_init: function() {
		if(this._holder.length) {
			this._area = $([
				'<div style="position: absolute; left: 0; top: 0; width: 100%; height: 100%; padding: 0; margin: 0; overflow: hidden; background-image: url(about:blank); z-index: 1;">',
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
		var self = this;
		this._getFixedFiles(evt.originalEvent.dataTransfer.files, function(files) {
			if(self._opt.onPreview) {
				self._toBeUploaded = {
					files: files
				};
				self._opt.onPreview(self._toBeUploaded);
			} else {
				self.uploadByDropFile(files);
			}
		});
		if(this._opt.onDrop) {
			this._opt.onDrop(evt);
		}
	},

	_onFileChange: function(evt) {
		var fileInput = this._removeFileInput();
		this._createFileInput();
		if(YomFileUploader.dropFileSupported) {
			var self = this;
			this._getFixedFiles(fileInput[0].files, function(files) {
				if(self._opt.onPreview) {
					self._toBeUploaded = {
						files: files
					};
					self._opt.onPreview(self._toBeUploaded);
				} else {
					self.uploadByDropFile(files);
				}
			});
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
		if(this._opt.onFileChange) {
			this._opt.onFileChange(evt);
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
		if(this._enableDropFile && YomFileUploader.dropFileSupported) {
			this._area.on('dragover', this._bind.dragover);
			this._area.on('dragenter', this._bind.dragenter);
			this._area.on('dragleave', this._bind.dragleave);
			this._area.on('drop', this._bind.drop);
		}
	},

	_unbindEvent: function() {
		this._area.off('click', this._bind.click);
		if(this._enableDropFile && YomFileUploader.dropFileSupported) {
			this._area.off('dragover', this._bind.dragover);
			this._area.off('dragenter', this._bind.dragenter);
			this._area.off('dragleave', this._bind.dragleave);
			this._area.off('drop', this._bind.drop);
		}
	},

	_dataUrlToFile: function(dataUrl, fileName) {
		var arr = dataUrl.split(',');
		var mime = arr[0].match(/:(.*?);/)[1];
		var bstr = atob(arr[1]);
		var n = bstr.length;
		var u8arr = new Uint8Array(n);
		while(n--) {
			u8arr[n] = bstr.charCodeAt(n);
		}
		var file;
		try {
			file = new File([u8arr], fileName, {type: mime});
		} catch(err) {
			file = new Blob([u8arr], {type: mime});
			file.name = fileName;
		}
		return file;
	},

	_getOptimizedImageFile: function(file, img, width, height, orientation, callback) {
		var imageOptions = this._opt.imageOptions || {};
		var scaleWidth, scaleHeight;
		if(imageOptions.maxWidth > 0) {
			if(orientation === 6 || orientation === 8) {
				scaleHeight = height > imageOptions.maxWidth ? imageOptions.maxWidth : height;
				scaleWidth = scaleHeight * width / height;
			} else {
				scaleWidth = width > imageOptions.maxWidth ? imageOptions.maxWidth : width;
				scaleHeight = scaleWidth * height / width;
			}
		} else if(imageOptions.maxHeight > 0) {
			if(orientation === 6 || orientation === 8) {
				scaleWidth = width > imageOptions.maxHeight ? imageOptions.maxHeight : width;
				scaleHeight = scaleWidth * height / width;
			} else {
				scaleHeight = height > imageOptions.maxHeight ? imageOptions.maxHeight : height;
				scaleWidth = scaleHeight * width / height;
			}
		} else {
			scaleWidth = width;
			scaleHeight = height;
		}
		if(orientation !== 3 && orientation !== 6 && orientation !== 8 && scaleWidth == width && scaleHeight == height) {
			callback(file);
			return;
		}
		var canvas = document.createElement('canvas');
		var ctx = canvas.getContext('2d');
		if(orientation === 3) {
			canvas.width = scaleWidth;
			canvas.height = scaleHeight;
			ctx.rotate(Math.PI);
			ctx.translate(-scaleWidth, -scaleHeight);
		} else if(orientation === 6) {
			canvas.width = scaleHeight;
			canvas.height = scaleWidth;
			ctx.rotate(Math.PI / 2);
			ctx.translate(0, -scaleHeight);
		} else if(orientation === 8) {
			canvas.width = scaleHeight;
			canvas.height = scaleWidth;
			ctx.rotate(-Math.PI / 2);
			ctx.translate(-scaleWidth, 0);
		} else {
			canvas.width = scaleWidth;
			canvas.height = scaleHeight;
		}
		ctx.drawImage(img, 0, 0, scaleWidth, scaleHeight);
		try {
			var mime = file.type || 'image/jpeg';
			if('toBlob' in canvas) {
				canvas.toBlob(function(blob) {
					var newFile;
					try {
						newFile = new File(blob, file.name, {type: mime});
					} catch(err) {
						newFile = blob;
						newFile.name = file.name;
					}
					callback(newFile);
				}, mime, imageOptions.quality > 0 && imageOptions.quality <= 1 ? imageOptions.quality : 1);
			} else {
				var dataUrl = canvas.toDataURL(mime, imageOptions.quality > 0 && imageOptions.quality <= 1 ? imageOptions.quality : 1);
				callback(this._dataUrlToFile(dataUrl, file.name));
			}
		} catch(err) {
			callback(file);
		}
	},

	_fixImageFile: function(file, callback) {
		var self = this;
		var reader = new FileReader();
		reader.onload = function() {
			var exifInfo = getExifInfo(reader.result);
			var width = exifInfo.width;
			var height = exifInfo.height;
			var orientation = exifInfo.orientation;
			if(width && height && typeof createImageBitmap == 'function') {
				createImageBitmap(new Blob([reader.result], {type: file.type || 'image/jpeg'}), 0, 0, width, height).then(function(img) {
					self._getOptimizedImageFile(file, img, width, height, orientation, callback);
				}).catch(function() {
					callback(file);
				});
			} else {
				reader = new FileReader();
				reader.onload = function() {
					var img = new Image();
					img.setAttribute('crossOrigin', 'anonymous');
					img.onload = function() {
						width = img.width;
						height = img.height;
						self._getOptimizedImageFile(file, img, width, height, orientation, callback);
					};
					img.onerror = function() {
						callback(file);
					};
					img.src = reader.result;
				};
				reader.onerror = function() {
					callback(file);
				};
				reader.readAsDataURL(file);
			}
		};
		reader.onerror = function() {
			callback(file);
		};
		reader.readAsArrayBuffer(file);
	},

	_getFixedFiles: function(files, callback) {
		var self = this;
		var fixedFiles = [];
		(function readFile(i) {
			var file = files[i];
			if(!(/^image\//i).test(file.type)) {
				fixedFiles.push(file);
				readFile(++i);
				return;
			}
			self._fixImageFile(file, function(file) {
				fixedFiles.push(file);
				if(i == files.length - 1) {
					callback(fixedFiles);
				} else {
					readFile(++i);
				}
			});
		})(0);
	},

	_createFileInput: function() {
		this._removeFileInput();
		this._fileInput = $([
			'<input type="file" ',
				'name="' + this._fileParamName + '" ',
				this._opt.accept ? 'accept="' + this._opt.accept + '" ' : '',
				this._opt.capture ? 'capture="' + this._opt.capture + '" ' : '',
				this._enableMultipleSelection && YomFileUploader.dropFileSupported ? 'multiple' : 'single',
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

	_getNewUploading: function(fileName, from, file) {
		var id = _uploadingCount++;
		var uploading = new Uploading(id, fileName, from, file);
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

	_uploadOneDropFile: function(uploading) {
		var self = this;
		var onProgress = this._opt.onProgress;
		var onLoad = this._opt.onLoad;
		var onError = this._opt.onError;
		var onComplete = this._opt.onComplete;
		this._onBeforeUpload(uploading, function(feedback) {
			var file, form, url;
			if(feedback === false) {
				return;
			}
			feedback = feedback || {};
			file = feedback.file || uploading.file;
			self._uploadings.push(uploading);
			url = feedback.url || self._url;
			form = new FormData();
			if(feedback.data) {
				$.each(feedback.data, function(key, val) {
					form.append(key, val);
				});
			}
			form.append(self._fileParamName, file);
			(feedback.xhrGetter || function(callback) {callback();})(function(xhr, headers) {
				xhr = xhr || new XMLHttpRequest();
				xhr.onload = function() {
					var res;
					if(onLoad) {
						if (!xhr.responseText && xhr.status === 200) {
							onLoad(uploading, {
								code: 0,
								msg: 'ok',
								data: feedback.data
							});
							return;
						}
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
					setTimeout(function() {
						if(self._pendingUploadings.length) {
							self._uploadOneDropFile(self._pendingUploadings.shift());
						}
					}, 0);
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
				if(self._opt.withCredentials) {
					xhr.withCredentials = true;
				}
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
		var onDropFile = this._opt.onDropFile;
		var uploadings;
		if(this._enableMultipleSelection) {
			uploadings = Array.prototype.slice.call(files).map(function(file) {
				return self._getNewUploading(file.name, 'DROP', file);
			});
		} else {
			uploadings = [this._getNewUploading(files[0].name, 'DROP', files[0])];
		}
		if(onDropFile) {
			uploadings = uploadings.filter(function(uploading) {
				return onDropFile(uploading) !== false;
			});
		}
		if(this._concurrency < uploadings.length) {
			this._pendingUploadings = this._pendingUploadings.concat(uploadings.slice(this._concurrency));
			uploadings = uploadings.slice(0, this._concurrency);
		}
		$.each(uploadings, function(i, uploading) {
			self._uploadOneDropFile(uploading);
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
			}
		});
	},

	getToBeUploaded: function() {
		return this._toBeUploaded;
	},

	clear: function() {
		this._toBeUploaded = null;
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
		this._pendingUploadings = null;
	}
});

return YomFileUploader;

})));
