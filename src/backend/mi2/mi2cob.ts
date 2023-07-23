import { Breakpoint, Stack } from "../backend";
import * as Path from 'path'
import { parseMI , MINode } from '../mi_parse';
import { MI2 } from './mi2';
import { Program } from "../cobolSymbolTab";
import * as fs from 'fs';

export class MI2_COB extends MI2{
	private Programs : Map< string , Program > = new Map();
	private stackBreakpoint : Breakpoint[] = [];
	private target : string ;

	private syncBreakpoints : Map< number , string > = new Map() ;

	private fileToPrograms : Map< string , Set<Program> > = new Map<string,Set<Program>>() ;

	initCommands(target: string, cwd: string, attach: boolean = false){

		this.sendRaw("handle SIGTRAP nostop noprint ");
		this.target = Path.basename(target).split(".")[0].toUpperCase();

		const allSymbolsFilePath : string[] = [] ;
		fs.readdirSync( cwd ).forEach((file)=>{
			if( Path.extname( file ).toLowerCase() == ".json" )
				allSymbolsFilePath.push( cwd + file );
		});	
		this.loadPrograms( allSymbolsFilePath );

		return super.initCommands(target,cwd,attach);
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
				this.Programs.set( entry , newProgram);
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
		this.Programs.forEach((program)=>{
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
		for( let key of this.Programs.keys() ){
			if( this.Programs.get( key ).isMe( address ) ){
				return key ;
			}
		}
	}

	async getStack(startFrame: number, maxLevels: number, thread: number): Promise<Stack[]> {
		const stack = super.getStack(startFrame,maxLevels,thread);
		const promises = [] ;
		(await stack).forEach(element=>{
			this.Programs.forEach((program)=>{
				promises.push( new Promise(()=>{
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
		const currProgram = this.Programs.get(entryName) ;
		currProgram.setAddressBase( entryName , Address );
		currProgram.breakpoints.clear() ;
		this.loadBreakPoints( this.stackBreakpoint );
		this.continue();
	}
	
}
