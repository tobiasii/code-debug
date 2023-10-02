import { Breakpoint, Stack , VariableObjectCobol } from "../backend";
import * as Path from 'path'
import { parseMI , MINode } from '../mi_parse';
import { MI2 } from './mi2';
import { Program } from "../cobolSymbolTab";
import * as fs from 'fs';
import * as net from 'net';
import { DebugProtocol } from 'vscode-debugprotocol';
import { parseCobolToString , parseStringToCobol } from "../utils/typeParseCob";

export class MI2_COB extends MI2{

	protected initCommands(target: string, cwd: string, attach: boolean = false){

		this.sendRaw("handle SIGTRAP nostop noprint ");
		this.target = Path.basename(target).split(".")[0].toUpperCase();

		const allSymbolsFilePath : string[] = [] ;
		fs.readdirSync( cwd ).forEach((file)=>{
			if( Path.extname( file ).toLowerCase() == ".json" )
				allSymbolsFilePath.push( cwd + file );
		});	
		this.loadPrograms( allSymbolsFilePath );
		this.initCobClassTrace();

		return super.initCommands(target,cwd,attach);
	}

	protected initCobClassTrace( ){
		this.trace_pipe = net.createServer((stream)=>{
			stream.on('data',(data)=>{
				const info = JSON.parse(data.toString());
				this.objectMap.set( parseInt( info.id ) , { name : info.name.toUpperCase() , type : info.type , address : parseInt(info.address) , children : info.children } );
			});
		}).listen("\\\\.\\pipe\\class_info");
	}

	addBreakPoint(breakpoint: Breakpoint): Thenable<[boolean, Breakpoint]> {
		const allPrograms = this.fileToPrograms.get( Path.win32.normalize( breakpoint.file.toLowerCase() ) );
		if( allPrograms ){
			return new Promise((resolve)=>{
				let bool , newBrk ;
				allPrograms.forEach(program=>{
					this.addProgramBreakPoint( program , breakpoint ).then(result=>{
						if( newBrk == undefined )
							[ bool , newBrk ] = result ;
					})
				})
				resolve([bool,newBrk])
			});
		}else{
			return super.addBreakPoint(breakpoint);
		}
	}

	addSyncBreakpoint( entryName : string): Thenable<[boolean,number]> {
		return new Promise((resolve, reject) => {
			this.sendCommand("break-insert -f " + (entryName == this.target ? "*0x401003" : entryName ) ).then((result) => {
				if (result.resultRecords.resultClass == "done") {
					const bkptNum = parseInt(result.result("bkpt.number"));
					this.syncBreakpoints.set( bkptNum , entryName );
					resolve([true,bkptNum]);
				}
			}, reject);
		});
	}

	addProgramBreakPoint( program : Program , breakpoint: Breakpoint): Thenable<[boolean, Breakpoint]> {
	
		return new Promise((resolve, reject) => {			
			if(this.breakpoints.has(breakpoint))
				return resolve([false, undefined]);
			if( program && program.getAddress( breakpoint.file , breakpoint.line ) > 0 ){
				const address =  program.getAddress( breakpoint.file ,breakpoint.line);
				this.log("",`add breakpoint ${ breakpoint.file }:${ breakpoint.line } -> 0x${address.toString(16)}`);

				this.sendCommand("break-insert -f *0x"+ address.toString(16) ).then((result) => {
					if (result.resultRecords.resultClass == "done") {
						const bkptNum = parseInt(result.result("bkpt.number"));
						const newBrk = {
							file: breakpoint.file ? breakpoint.file : result.result("bkpt.file"),
							raw: breakpoint.raw,
							line: breakpoint.line,
							condition: breakpoint.condition
						};
						this.breakpoints.set(newBrk, bkptNum);
						program.breakpoints.add( newBrk );
						resolve([true, newBrk]);
					}
				}, reject);
			}else{
				this.stackBreakpoint.push(breakpoint);
				return resolve([false, undefined]);
			}
		});
	}

	loadBreakPoints(breakpoints: Breakpoint[]): Thenable<[boolean, Breakpoint][]> {
		this.stackBreakpoint = [] ;
		const promisses = breakpoints.map(breakpoint => {
			return this.addBreakPoint(breakpoint) ;
		});
		return Promise.all(promisses);
	}

	unloadBreakPoints(breakpoints: Breakpoint[]): Thenable<boolean[]> {
		const promisses = breakpoints.map(breakpoint => {
			return this.removeBreakPoint(breakpoint) ;
		});
		return Promise.all(promisses);
	}

	loadProgram( filePath : string ) : Promise<Program> {
		return new Promise(()=>{
			const newProgram = new Program( filePath );
			for(let entry of newProgram.entrys.keys() ){
				this.programs.set( entry , newProgram);
				this.addSyncBreakpoint( entry );
			}
			return newProgram;
		});
	}

	loadPrograms( filePaths : string[]){

		const promisses = filePaths.map(filePath => {
			return this.loadProgram(filePath) ;
		});
		Promise.all(promisses).then(()=>{});
		this.programs.forEach((program)=>{
				program.copys.forEach(file=>{
					if(!this.fileToPrograms.has(file)){
						const set : Set<Program> = new Set();
						set.add( program );
						this.fileToPrograms.set(file,set);
					}else{
						const set = this.fileToPrograms.get(file);
						set.add( program );
					}
			});
		});
	}

	getProgramByAddress( address : number ) : string  {
		for( let key of this.programs.keys() ){
			if( this.programs.get( key ).isMe( address ) ){
				return key ;
			}
		}
	}

	async getStack(startFrame: number, maxLevels: number, thread: number): Promise<Stack[]> {
		const stack = super.getStack(startFrame,maxLevels,thread);
		const promises = [] ;
		(await stack).forEach(element=>{
			this.programs.forEach((program)=>{
				promises.push( new Promise(()=>{
					this.sendCliCommand(`print (void)mF_eloc("gdb_trace.dll",13)`);
					if(program.isMe( parseInt(element.address,16) )){
						const fileAndLine = program.getFileAndLine( parseInt(element.address,16) );
						element.fileName = Path.basename(fileAndLine.file);
						const program_id = program.getScope( parseInt(element.address,16) ) ;
						element.function = `${program_id.parent}${(program_id.parent != "" )?":":""}${program_id.id}` ;
						element.file = Path.win32.normalize(fileAndLine.file);
						element.line = fileAndLine.line ;
					}
				}));
			});
		});
		Promise.all( promises );
		return stack;	
	}

	onOutput(lines: any): void {
		lines = <string[]> lines.split('\n');
		for( let line of lines ){	
			const parsed = parseMI(line);
			if (parsed.outOfBandRecord )
			parsed.outOfBandRecord.filter((record)=>{ return ( !record.isStream ) }).forEach((record)=>{
				const reason = parsed.record("reason");
				if( reason )
				switch (reason) {
					case "breakpoint-hit" :
						this.handleBreakpoints( parsed );
						break;
				}
			});
		}
		super.onOutput(lines.join("\n"));
	}

	handleBreakpoints( parsed : MINode ){
		const bkptNum = parseInt(parsed.record("bkptno"));		
		if( this.syncBreakpoints.get( bkptNum )){
			this.handleLibraryLoad( parsed );
			return true ;
		}
	}

	handleLibraryLoad( parsed : MINode ){
		const bkptNum = parseInt(parsed.record("bkptno"));
		const entryName = this.syncBreakpoints.get( bkptNum );

		const Address = parseInt( parsed.record("frame.addr") , 16) - 3 ;
		const currProgram = this.programs.get(entryName) ;
		currProgram.setAddressBase( entryName , Address );
		currProgram.breakpoints.clear() ;
		this.loadBreakPoints( this.stackBreakpoint );
		this.continue();
	}

	async getBaseFrame( frame : number ){
		let currFrame : number = 0 ;
		let addrBaseFrame : number = parseInt((await this.sendCommand(`data-list-register-values x 5`)).result("register-values[0].value") , 16 );
		while( currFrame != frame ){
			currFrame++;
			const newAddrBaseFrame : string = ((await this.sendCommand(`data-read-memory ${addrBaseFrame} x 4 1 1`)).result(`memory[0].data[0]`));
			addrBaseFrame = parseInt( newAddrBaseFrame , 16 );
		}
		return addrBaseFrame ;
	}

	async testCobProgram( thread: number, frame: number ){
		const address = parseInt((await this.sendCommand(`stack-list-frames --thread ${thread}`)).result(`stack.frame[${frame}].addr`),16);
		const programName : string =  this.getProgramByAddress( address ) ;
		return (programName)? true : false ;
	}

	async getProgramAndFunction( thread: number , level : number ) {
		const address = parseInt((await this.sendCommand(`stack-list-frames --thread ${thread}`)).result(`stack.frame[${level}].addr`),16);
		const programId : string =  this.getProgramByAddress( address ) ;
		const program = this.programs.get( programId );
		const functionId = program.getScope( address ).id ;
		return { programId : programId , functionId : functionId , address : address  } ;
	}

	async getStackVariablesObject(thread: number, frame: number , scope : string = "local" ): Promise<VariableObjectCobol[]> {

		const address = parseInt((await this.sendCommand(`stack-list-frames --thread ${thread}`)).result(`stack.frame[${frame}].addr`),16);
		const programName : string =  this.getProgramByAddress( address ) ;
		const baseFrame = await this.getBaseFrame( frame );		
		
		let ret: VariableObjectCobol[] = [];
		if(programName){
			const currentProgram = this.programs.get( programName );
			const [ variables , functionName ]  = currentProgram.getScopeVariables( address , scope.toUpperCase() );
			for(const key of variables){
				const variable = currentProgram.getVariable(key,functionName,baseFrame);
				if( variable != undefined ){
					ret.push( await this.getVariableObject( variable , baseFrame ) );
				}
			}
		}
		return ret;
	}

	async readVariable( type : string , address : number , lenght : number ) : Promise<string> {
		let output : string ;
		if( type == "" ){
			output = "{...}" ;
		}else if(/.*COMP-(1|2).*/.test(type)){
			output = ((await this.sendCommand(`data-read-memory ${address} f ${lenght} 1 1`)).result(`memory[0].data[0]`));
		}else if( /.*S.*COMP(-5|-X)*$/.test(type)){
			output = ((await this.sendCommand(`data-read-memory ${address} d ${lenght} 1 1`)).result(`memory[0].data[0]`));
		}else if(/.*COMP(-5|-X)*$/.test(type)){
			output = ((await this.sendCommand(`data-read-memory ${address} u ${lenght} 1 1`)).result(`memory[0].data[0]`));
		}else if(/.*POINTER.*/.test(type)){
			output = ((await this.sendCommand(`data-read-memory ${address} x ${lenght} 1 1`)).result(`memory[0].data[0]`));
		}else if(/.*OBJECT.*/.test(type)){
			output = ((await this.sendCommand(`data-read-memory ${address} x ${lenght} 1 1`)).result(`memory[0].data[0]`)) ;	
		}else{
			const result = this.sendCommand(`data-read-memory-bytes ${address} ${lenght}`);
			const value = (await result).result("memory[0].contents");
			output = parseCobolToString( type , value );
		}
		return output ;
	}

	async getVariableObject( staticVariableInfo , memoryReference : number = 0 ) : Promise<VariableObjectCobol>{
		let variable = new VariableObjectCobol();
		if( staticVariableInfo ){
						
			const offset  = staticVariableInfo.isReference ? 0 : staticVariableInfo.offset ; 
			const address = staticVariableInfo.memoryReference + offset ;
			const isObject = /.*OBJECT.*/.test( staticVariableInfo.type ) ;

			variable.name = staticVariableInfo.name ;
			variable.exp  = staticVariableInfo.exp ;
			variable.type = `${staticVariableInfo.type} : ${staticVariableInfo.lenght} byte(s)` ;

			try{
				if( staticVariableInfo.isReference ){
					const valuePtr = parseInt( await this.readVariable( "POINTER" , address , 4 ) , 16 ) + staticVariableInfo.offset ;
					if( isObject ){
						this.sendCliCommand(`print (void)gdb_pipe_ref(${valuePtr})`);
						variable.memoryReference = valuePtr ;
					}
					variable.value = ( !/.*GROUP.*/.test( variable.type ) )? await this.readVariable( staticVariableInfo.type , valuePtr , staticVariableInfo.lenght ) : "{...}" ;
				}else{
					if( isObject )this.sendCliCommand(`print (void)gdb_pipe_ref(${address})`);
					variable.value = ( !/.*GROUP.*/.test( variable.type ) )? await this.readVariable( staticVariableInfo.type , address , staticVariableInfo.lenght ) : "{...}";
				}
				variable.numchild = staticVariableInfo.children ;
				variable.memoryReference = memoryReference ;

				if(isObject){
					variable.objectReference = parseInt( variable.value , 16 ) ;
					const info = this.objectMap.get( variable.objectReference );
					variable.value = `${info.type}::${info.name}(${variable.value})`;
					variable.numchild = 1 ;
				}
			}catch(err){
				variable.numchild = 0 ;
				variable.value = `< address 0x${address.toString(16)} invalid >` ;
				variable.memoryReference = 0 ;
			}
		}
		return variable ;
	}

	async varCobListChildren( name :  string , threadId : number , level : number ): Promise<VariableObjectCobol[]> {
		const omg: VariableObjectCobol[] = [] ;

		const { programId , functionId } = await this.getProgramAndFunction( threadId , level );	
		const baseFrame = await this.getBaseFrame( level );
		
		if( programId ){
			const program = this.programs.get(programId);
			const variables = program.getVariableChildren( name , functionId , programId ) ;
			for(let key of variables ){
				const children = program.getVariable(key , functionId , baseFrame );
				if( children != undefined ){					
					omg.push( await this.getVariableObject( children , baseFrame ) );
				}else{
					throw (`"${key}" variavel nao encotrada `);
				}
			}
			return omg;
		}else{
			throw (`Error not found ${programId}`);
		}
	}

	async getObjectReferenceInfo( hObject : number , attrExp : string = "LOCAL" ){
		let allAttributes : VariableObjectCobol[] = [ ] ;
		if( this.objectMap.has( hObject )){
			const { name , type , address , children } = this.objectMap.get( hObject ) ;
			const program = this.programs.get( name.toUpperCase() )
			if( children.length > 0 ){
				for( let element of children ){
					const subObject = this.objectMap.get( element.value );
					let varObj =  new VariableObjectCobol();
					varObj.exp = element.key ;
					if( name.toUpperCase() != "CHARACTERARRAY" ){
						varObj.objectReference = element.value ;
						varObj.value = `${subObject.type}::${subObject.name}(${element.value})`;
						varObj.type = "OBJECT" ;
						varObj.numchild = (element.value == 0 && element.value == parseInt("0x20202020",16))? 0 : 1 ;
					}else{
						varObj.objectReference = hObject ;
						varObj.type = "PIC X" ;
						varObj.value = parseCobolToString( varObj.type , (element.value & 0xFF ).toString(16) ) ;
						varObj.numchild = 0 ;
					}
					allAttributes.push( varObj );
				}
			}else if( program && address ){
				const attributes = program.getVariableChildren(attrExp,type,name).filter((attr)=>{ return (attr != "SELF" && attr != "SELFCLASS") });
				for( let attr of attributes ){
					const variable = program.getVariable( attr , type , address );
					let varObj : VariableObjectCobol = await this.getVariableObject( variable , address ) ;
					if( !varObj.objectReference )varObj.objectReference = hObject ;
					allAttributes.push( varObj );
				}
			}
		}
		return allAttributes ;
	}

	private async resolveVariableAddress( name : string , programId : string , functionId : string , baseFrame : number ){
		const program = this.programs.get( programId );
		const nameUpper = name.toUpperCase() ;
		const parentFunctionId = program.listSubProgram.get( functionId ).parent ;
		if( parentFunctionId == "CLASSOBJECT" || parentFunctionId == "OBJECT" ){
			const attrClass = program.listSubProgram.get( "CLASSOBJECT" ).variables;
			const attrInstance = program.listSubProgram.get( "OBJECT" ).variables;
			const isAttribute = ( attrClass.has( nameUpper ) || attrInstance.has( nameUpper ) ) ;
			if( program.listSubProgram.get( parentFunctionId ).variables.has( nameUpper ) ){
				const selfStaticInfo = program.getVariable( "SELF" , functionId , baseFrame );
				const selfObject = this.getVariableObject( selfStaticInfo , baseFrame ) ;
				const hObject = (await selfObject).objectReference ; 
				return this.objectMap.get( hObject ).address ;
			}else if( isAttribute ){
				return undefined ;
			}
		}
		return baseFrame ;
	}

	async evalCobVarExpr( name: string, thread: number, level: number , value : string | undefined = undefined ): Promise<VariableObjectCobol> {

		const { programId , functionId } = await this.getProgramAndFunction( thread , level );	
		const baseFrame = await this.getBaseFrame( level );

		if(programId){
			const program = this.programs.get( programId );
			let memoryReference = await this.resolveVariableAddress( name.toUpperCase() , programId , functionId , baseFrame );
			if( !memoryReference )
				return new VariableObjectCobol() ;
			const variable = program.getVariable( name.toUpperCase() , functionId , memoryReference );
			if( variable != undefined ){
				return await this.getVariableObject( variable , memoryReference );
			}
		}
		return new VariableObjectCobol() ;
	}

	async writeVariable( type : string , address : number , lenght : number , value : string ) : Promise<string> {
		if(/.*COMP-(1|2).*/.test(type)){
			const type = ( lenght == 4 )?"float":"double";
			await this.sendCliCommand(`set {${type}}0x${address.toString(16)} = ${value}`);
		}else if( /.*S.*COMP.*/.test(type)){
			if( !/COMP-5/.test(type) ) this.sendCliCommand("set endian big");
			await this.sendCommand(`data-write-memory ${address} d ${lenght} ${value}`);
			if( !/COMP-5/.test(type) ) this.sendCliCommand("set endian little");
		}else if(/.*COMP.*/.test(type)){
			if( !/COMP-5/.test(type) ) this.sendCliCommand("set endian big");
			await this.sendCommand(`data-write-memory ${address} u ${lenght} ${value} `);
			if( !/COMP-5/.test(type) ) this.sendCliCommand("set endian little");
		}else if(/.*POINTER.*/.test(type)){
			await this.sendCommand(`data-write-memory ${address} x ${lenght} ${value}`);
		}else if(/.*OBJECT.*/.test(type)){
			if( /.*\((.*)\).*/.test(value) )
				value = /.*\((.*)\).*/.exec( value )[1] ;
			await this.sendCommand(`data-write-memory ${address} x ${lenght} ${value}`);
		}else{
			const parsed = parseStringToCobol( type , value );
			this.sendCommand(`data-write-memory-bytes ${address} "${parsed}" ${lenght}`);
		}
		return this.readVariable( type , address , lenght ) ;
	}

	async setVariableObject( staticVariableInfo , value : string ) : Promise<string>{
		if( staticVariableInfo ){
			const offset  = staticVariableInfo.isReference ? 0 : staticVariableInfo.offset ; 
			const address = staticVariableInfo.memoryReference + offset ;

			try{
				if( staticVariableInfo.isReference ){
					const valuePtr = parseInt( await this.readVariable( "POINTER" , address , 4 ) , 16 ) + staticVariableInfo.offset ;
					return await this.writeVariable( staticVariableInfo.type , valuePtr , staticVariableInfo.lenght , value );
				}else{
					return await this.writeVariable( staticVariableInfo.type , address , staticVariableInfo.lenght , value );
				}
			}catch(err){
				return `< address 0x${address.toString(16)} invalid >` ;
			}
		}
		return "" ;
	}

	async setObjectReferenceInfo( hObject : number , attr : string , value : string ) : Promise<string>{
		const { name , type , address } = this.objectMap.get( hObject ) ;
		const program = this.programs.get( name.toUpperCase() )

		if( program && address ){
			const variable = program.getVariable( attr.toUpperCase() , type , address );
			return await this.setVariableObject( variable , value ) ;
		}
		return "not found" ;
	}

	async setCobVarExpr( name: string, thread: number, level: number , value : string | undefined = undefined , address : number = 0 ): Promise<string> {

		const { programId , functionId } = await this.getProgramAndFunction( thread , level );
		let memoryReference = (address)? address : await this.getBaseFrame( level );
		if(programId){
			const program = this.programs.get( programId );
			memoryReference = await this.resolveVariableAddress( name , programId , functionId , memoryReference );
			if( !memoryReference )
				return "not availabe" ;
			const variable = program.getVariable( name.toUpperCase() , functionId , memoryReference );
			if( variable != undefined ){	
				return await this.setVariableObject( variable , value );
			}
		}
		return "not availabe" ;
	}

	async getDisassembly( memoryAddress : string ) : Promise< DebugProtocol.DisassembledInstruction[]> {
		const dasm: DebugProtocol.DisassembledInstruction[] = [];

		const memoryAddressNumber = parseInt(memoryAddress,16) ;
		const programName = this.getProgramByAddress( memoryAddressNumber );
		
		if( programName ){
			const program = this.programs.get( programName ) ;
			const startAddrProgram = program.getAddressBase() ;
			const endAddrProgram = startAddrProgram + program.codeSize ;
			const startAddress = ( startAddrProgram > memoryAddressNumber - (4*16) ) ? startAddrProgram : ( memoryAddressNumber - (4*16) );
			const endAddress   = ( endAddrProgram   < memoryAddressNumber + (4*32) ) ? endAddrProgram   : ( memoryAddressNumber + (4*32) ) ;

			const result = this.sendCommand(`data-disassemble -s ${startAddress} -e ${endAddress} -- 0`) ;
			
			const insts = (await result).result("asm_insns") ;
			insts.forEach( items => {

				const address = items.filter( (element) => element[0] == "address" )[0][1];
				const inst = items.filter( (element) => element[0] == "inst" )[0][1];
				dasm.push({ address : address , instruction : inst });
			});
		}
		return dasm ;
	}

	clearAllTempBreakpoint(){
		const promises = this.tempBreakpoints.map((bkptno)=>{
			return new Promise((resolve)=>{ this.sendCommand(`break-delete ${bkptno.toString()}`).then(()=>{ resolve(true) }) }) ;
		});
		Promise.all(promises).catch(()=>{ throw("error ao remover breakpoint de temporario!!!") });
		this.tempBreakpoints = [];
	}

	clearAllBoundBreakpoint(){
		const promises = [] ;
		this.boundBreakpoint.forEach((bkptno)=>{
			promises.push( new Promise((resolve)=>{ this.sendCommand(`break-delete ${bkptno.toString()}`).then(()=>{ resolve(true) }) }) )
		});
		Promise.all(promises).catch(()=>{ throw("error ao remover breakpoint de borda!!!") });
		this.boundBreakpoint.clear();
	}

	addPossibleLines( address : number , isStepIn : boolean = false ) : boolean {
		const programName : string = this.getProgramByAddress( address ) ;
		const program = this.programs.get( programName );
		if( program ){
			const promisses = [] ;
			let [ steps , isBound ] = program.getStep( address , isStepIn );

			if( !isBound ){
				const boundAddress = program.getNearBound( address );
				if( address == boundAddress ){
					isBound = true
				}else{
					steps.forEach((stepAddress)=>{
						promisses.push(
							new Promise<boolean>((resolve)=>{
								this.sendCommand(`break-insert -f *${stepAddress}`).then((result)=>{
									const bkpId = parseInt( result.result("bkpt.number") );
									this.tempBreakpoints.push( bkpId );
									resolve(true);
								});
							})
						);
					});
					this.sendCommand(`break-insert -f ${boundAddress}`).then((result)=>{
						const bkpId = parseInt( result.result("bkpt.number") );
						this.boundBreakpoint.add(bkpId);
					});
				}
				if( isStepIn ){
					//this.programs.forEach( pProgram => {
					//	promisses.push( this.addAll )
					//});
				}
			}
			Promise.all( promisses );
			return isBound ;
		}
		return true ;
	}

	private stepRaw( reverse : boolean = false , isStepIn : boolean ) : Thenable<boolean> {
		return new Promise((resolve,reject)=>{
			this.testCobProgram( -1 , 0 ).then((isCobol)=>{
				if( isCobol ){
					this.sendCommand(`stack-list-frames`).then((result)=>{
						const address = parseInt( result.result(`stack.frame[0].addr`) , 16 );
						if( this.addPossibleLines( address , isStepIn )){
							this.sendCommand("exec-finish").then((info)=>{
								resolve(info.resultRecords.resultClass == "running" );
							},reject);
						}else{
							this.sendCommand("exec-continue").then((info)=>{
								resolve(info.resultRecords.resultClass == "running" );
							},reject);
						}
					});
				}else{
					if( isStepIn ){
						super.step( reverse );
					}else{
						super.next( reverse );
					}
				}
			});
		});
	}

	next( reverse?: boolean): Thenable<boolean> {
		return this.stepRaw( reverse , false );
	}

	step( reverse?: boolean): Thenable<boolean> {
		return this.stepRaw( reverse , true );
	}

	private programs : Map< string , Program > = new Map();
	private stackBreakpoint : Breakpoint[] = [];
	private target : string ;
	private syncBreakpoints : Map< number , string > = new Map() ;
	private fileToPrograms : Map< string , Set<Program> > = new Map<string,Set<Program>>() ;
	private objectMap : Map< number , { name : string , type : string , address : number , children? : { key : string  , value : number }[] } > = new Map() ;
	private trace_pipe : net.Server ;

	private tempBreakpoints : number[] = [] ;
	private boundBreakpoint : Set<number> = new Set();
}
