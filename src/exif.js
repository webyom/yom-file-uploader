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

export function getExifInfo(ab) {
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
};
