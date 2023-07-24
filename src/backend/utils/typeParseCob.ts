import * as legacy from "legacy-encoding";

const digite_occurs_expr = /([\w\d])\((\d+)\)/
function expand_digit_occurs( picture : string ){
    let pic = picture ;
    let match = pic.match(digite_occurs_expr);
    while( match ){
      const char = match[1] ;
      const occurs = parseInt( match[2] ) ;
      pic = pic.replace(digite_occurs_expr, char.repeat(occurs) );
      match = pic.match(digite_occurs_expr);
    }
    return pic ;
}

function insertAt( src : string , char : string , positon  ){
	return src.slice(0, positon) + char + src.slice(positon);
}

function parseComp3ToString( type : string , valueHexStr : string ){
	let bytes : string = "" ;
	for(var index = 0 ; index < valueHexStr.length  ; index = index + 2){
		let byte = valueHexStr.slice(index,index+2);
		bytes += (( parseInt(byte,16) & 0xf0 ) >> 4 ).toString(16) ;
		bytes += (( parseInt(byte,16) & 0x0f ) >> 0 ).toString(16) ;
	}
	if( /PIC +.*S|s.*/.test(type) ){
		const signalByte = bytes.slice(-1);
		bytes = (( signalByte == "d" )?"-":"+") + bytes.slice(0,bytes.length-1); ;
	}
	return bytes ;
}
export function hexToString( type : string , valueHexStr : string ){
	let bytes : number[] = [];
	let signal = "" ;
	for(var index = 0 ; index < valueHexStr.length  ; index = index + 2){
		let byte = valueHexStr.slice(index,index+2);
		bytes.push( parseInt(byte,16) );
	}
	if( /PIC +.*S|s.*/.test(type) ){
		const byte = bytes.pop() ;
		bytes.push( byte & (0xff >> 2) );
		signal = ( byte & 0xC0 )?"-":"+";
	}

	const result = `"${signal}${ legacy.decode( new Uint8Array(bytes) , 1252 )}"` ;
	if(/PIC +.*V.*/.test(type)){
		let mask : string = expand_digit_occurs(type).toUpperCase() ;
		let positon = mask.replace(/PIC +/,'').search('V');
		return insertAt( result , ',' , positon + 1 ) ;
	}else{
		return result ;
	}
}

export function parseCobolToString(type:string, value:string) : string {
	if(/.*(COMP-3)$/.test(type))
		return parseComp3ToString(type,value);
	else if(/(PIC)/.test(type)){
		return hexToString( type , value) ;
	}else{
		return value ;
	}
}

export function stringToHex( type : string , value : string ) : string {
	const valueRaw = /"*(.+)"*/.exec(value)[1];
	const bytes = legacy.encode( valueRaw , 1252 ) ;
	let stringBytes = "" ;
	bytes.forEach(byte=>{ stringBytes += byte.toString(16) });
	return stringBytes ;
}

export function parseStringToCobol( type : string , value : string ){
	if(/.*(COMP-3)$/.test(type))
		return value;
	else if(/(PIC)/.test(type)){
		return stringToHex( type , value ) ;
	}else{
		return value ;
	}
}