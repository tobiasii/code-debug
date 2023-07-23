import { Breakpoint } from "./backend";
import * as Path from 'path'
import * as fs	from 'fs'

class SymbolCobol{
	offset 	: number ;
	lenght	: number ;
	type?	: string ;
};

class SymbolVariableCobol extends SymbolCobol{
	parent : string ;
	level? : number ;
	name  : string ;
	child : string[] ;
	location?: string ;
	link_idx?: number ;
	occurs?: number ;
}

class SymbolLineCobol extends SymbolCobol{
	step : number[]; 
	stepIn : number[];
	stepOut : number ;
	isBound : boolean ;
}

class SymbolProgramCobol{
	id : string ;
	variables : Map<string,SymbolVariableCobol> ;
	lineTop : number ;
	lineBack: number ;
	from : number ;
	to	 : number ;
	parent : string ;
}

export class Program{

	private  lineInfo : Map< number , SymbolLineCobol > = new Map();
	private  offsetToLineInfo : Map< number , SymbolLineCobol > = new Map();
	private  variables: Map< string , SymbolVariableCobol > = new Map();
	private  filesMap : Map< string , number >  = new Map();
	private  addrMap  : Map< number , string >  = new Map();
	public readonly listSubProgram : Map<string,SymbolProgramCobol> = new Map() ;
	public readonly entrys : Map< string , number > = new Map() ;
	public readonly copys  : string [] = [] ;

	public readonly	 sourceDir: string = "" ;
	public readonly  codeSize : number = 0 ;

	private offsetDataBase : number = 0 ;
	private offsetLinkBase	: number = 0 ;
	private offsetLocalBase : number = 0 ;
	private hasLocalSection : boolean = false ;
	
	public breakpoints : Set<Breakpoint> = new Set() ;

	constructor( debugFilesPath : string , private addressBase : number = 0 ,  log?){

		try{			
			const tree = JSON.parse( fs.readFileSync( debugFilesPath ).toString() );
			this.sourceDir = tree.directory ;
			this.codeSize = parseInt(tree.codeLength,16) ;
			this.offsetDataBase = parseInt(tree.dataAddress,16) - parseInt(tree.codeAddress,16) ;
			this.offsetLocalBase = parseInt(tree.Local,16) ;
			this.offsetLinkBase =  parseInt(tree.Linkage,16);
			this.hasLocalSection = (tree.hasLocalSection == "true")? true : false ;

			tree.lines.forEach(line_info => {
				const key : string = Path.win32.normalize( line_info.file ).toLowerCase() + ":" + line_info.line ;
				this.filesMap.set( key ,  parseInt( line_info.id ) );
				const offset = parseInt(line_info.offset)

				const symbol = {
					offset 	: parseInt( line_info.offset ),
					lenght	: parseInt( line_info.length ),
					type	: "",
					step	: (line_info.step)? line_info.step.map((step)=>{ return parseInt( step ) }):[] ,
					stepIn  : (line_info.stepIn)?line_info.stepIn.map((stepIn)=>{ return parseInt( stepIn ) }) : [] ,
					stepOut : parseInt( line_info.stepOut ),
					isBound : (line_info.isBound == "true")
				}
				this.lineInfo.set( parseInt( line_info.id ) , symbol )
				this.offsetToLineInfo.set( offset , symbol );
				this.addrMap.set( offset , key  );
			});

			for( let programKey in tree.programs ){
				const program = tree.programs[programKey];
				let listVariables : Map<string,SymbolVariableCobol> = new Map() ;
				if( program.variables ){
					for(let variableKey in program.variables) {
						const variable = program.variables[variableKey];
						const key = variable.id ;
						let children : string[] = [] ;
						children = ( variable.child )? variable.child : [] ;
						const symbol = {
							parent : variable.parent ,
							name : variable.name ,
							level : parseInt(variable.level),
							offset 	: parseInt( variable.offset ),
							lenght	: parseInt(	variable.size ),
							type	: variable.picture ,
							child   : children ,
							location : variable.location ,
							occurs 	 : parseInt(variable.occurs),
							link_idx : variable.link_idx
						}
						this.variables.set(key,symbol);
						listVariables.set(key,symbol);
					}
				}
				this.listSubProgram.set( programKey ,{
					id : programKey ,
					variables : listVariables ,
					lineTop : parseInt(program.lineTop) ,
					lineBack: parseInt(program.lineBack) ,
					parent : program.parent,
					from : parseInt( program.from ),
					to : parseInt( program.to )
				});
			}

			for(let entry in tree.entrys ){
				const offset = tree.entrys[entry];
				this.entrys.set( entry , offset );
			}

			for(let copy of tree.copys ){
				this.copys.push( Path.win32.normalize( (this.sourceDir + "\\" + copy.file).toLowerCase() ) );
			}
			
		}catch(err){
			console.error("Error: " + err.toString());
		}		
	}

	getScope( address : number ) : SymbolProgramCobol {
		const loc = this.getFileAndLine( address );
		const absoluteLine = this.getAbsoluteLine( Path.win32.relative( this.sourceDir , loc.file ) , loc.line );
		return this.getProgramByAbsoluteLine( absoluteLine );	
	}

	getParentVariables( parentName : string , scope : string ) : string[] {
		const program = this.listSubProgram.get( parentName );
		let listVariables : string[] = [] ;

		if(program.variables.has( scope ) )
			program.variables.get( scope ).child.forEach( variable => { listVariables.push( variable ) } );

		if( program.parent != "" )
			this.getParentVariables( program.parent , scope ).forEach( variable => { listVariables.push( variable ) } );

		return (listVariables) ? listVariables : [] ;
	}

	getScopeVariables( address : number , scope : string = "LOCAL" ) : [string[],string] {
		
		const currentProgram = this.getScope( address );
		const scopeUpper = scope.toUpperCase() ;
		
		let listVariables : string[] = [] ;
		if( currentProgram.variables.has(scopeUpper) )
			listVariables = (currentProgram.variables.get(scopeUpper).child);
		if( scopeUpper == "GLOBAL" && currentProgram.parent != "" )
			this.getParentVariables( currentProgram.parent , scopeUpper ).forEach( variable => { listVariables.push( variable ) } );
		if( scopeUpper == "CLASS" && currentProgram.parent != "" ){
			const parent = this.listSubProgram.get( currentProgram.parent ) ;
			if( parent.variables.has("LOCAL") )
				listVariables =  parent.variables.get("LOCAL").child ;
		}
		return [ listVariables , currentProgram.id  ];
	}

	private parseName( name : string ) : [ string , number[] ] {
		const match = /([\w\d\-]+)\((.*)\)/.exec(name);
		if( match ){
			const nameId = match[1] ;
			const idxs : number[] =  match[2].split(",").map((idx)=>{ return parseInt(idx)  });
			return [ nameId , idxs ] ;
		}else{
			return [ name , [] ] ;
		}
	}

	private processOccursOffset( program : SymbolProgramCobol , name : string , idxs : number[] ){
		let offset : number = 0 ;
		const variable = program.variables.get( name );
		if( variable ){
			if( idxs.length > 0 && variable.occurs > 0 ){
				const idx = idxs.pop() ;
				offset += variable.lenght * ( idx - 1 );
			}
			if( idxs.length > 0 && variable.parent != "" ){
				offset += this.processOccursOffset( program , variable.parent , idxs );
			}
		}
		return offset ;			
	}

	protected searchVariable( nameId : string , functionId ) : [ SymbolVariableCobol , SymbolProgramCobol , number ]{

		const [ name , idxs ] = this.parseName( nameId );

		const program : SymbolProgramCobol = this.listSubProgram.get( functionId );
		const variable : SymbolVariableCobol = program.variables.get( name );
		const occursOffset : number = this.processOccursOffset( program , name , idxs );

		if( !variable && program.parent != "" )
			return this.searchVariable( name , program.parent.toUpperCase() );
		return [ variable , program , occursOffset ] ;
	}

	private getVariableAddress( program : SymbolProgramCobol , variable : SymbolVariableCobol , baseFrameAddress : number ){
		if( variable.location == "LC" )
			return baseFrameAddress - this.offsetLocalBase ;
		else if( variable.location == "LS" )
			return baseFrameAddress - this.offsetLinkBase + ((variable.link_idx-1)*4) ;
		else if( variable.location == "OS" ) 
			return baseFrameAddress ;
		else{
			if( this.hasLocalSection )
				return this.offsetDataBase + this.addressBase ;			
			else
				return baseFrameAddress + 0x8 ;
		}
	}

	getVariable( name : string , functionId : string = "" , baseFrameAddress ){

		let [ element , program , tabOffset ] = this.searchVariable( name , functionId.toUpperCase() );
		if( element ){
			const [ nameId , idxs ] = this.parseName( name )
			let nameCamel = ( element.name )? element.name : name ;

			let children : number = 0 ;
			if(element.occurs > 0 && idxs.length < this.processOccursDepth( program , nameId )){
				children = element.occurs ;
			}else{
				children = element.child.length ;
				if( idxs.length > 0 && element.occurs > 0 ){
					nameCamel = this.parseSectionOccurs( idxs );
				}
			}

			return { 
				name : name , 
				exp : nameCamel ,
				level : element.level ,
				type: element.type , 
				offset : element.offset + tabOffset , 
				lenght : element.lenght , 
				children : children ,
				functionId : functionId ,
				memoryReference : this.getVariableAddress( program , element , baseFrameAddress ) ,
				isReference : ( element.location == "LS" )? true : false 
			};
		}else
			return undefined ;
	}

	private processOccursDepth( program : SymbolProgramCobol , nameId : string ) : number {
		let depth : number = 0 ;
		const variable = program.variables.get( nameId );
		if( variable.occurs > 0 ){
			depth++;
		}
		if( variable.parent != ""){
			depth += this.processOccursDepth( program , variable.parent );
		}
		return depth ;
	}

	private parseSectionOccurs( idxs : number[] ){
		let selection : string = "" ;
		if( idxs.length > 0 ){
			selection = "("
			for( let idx of idxs ){
				selection += idx.toString() + "," ;
			}
			selection = selection.slice( 0, selection.length - 1 ) + ")"
		}
		return selection ;
	}

	getVariableChildren( name : string , functionId : string = "" , programName : string = "" ) : string[] {
			const subProgram = this.listSubProgram.get( functionId );
			if( subProgram ){
				const [ nameId , idxs ] = this.parseName( name );
				if( subProgram.variables.has( nameId ) ){
					const variable = subProgram.variables.get( nameId ) ;
					if( variable.occurs > 0 && idxs.length < this.processOccursDepth( subProgram , nameId ) ){
						let children : string[] = [] ;
						for(let idx = 1 ; idx <= variable.occurs ; idx++ ){
							idxs.push( idx ) ;
							children.push( nameId + this.parseSectionOccurs( idxs ) );
							idxs.pop();
						}
						return children ;						
					}else if( variable.child.length > 0 ){
						let children : string[] = [] ;
						for( let child of subProgram.variables.get( nameId ).child ){
							children.push( child + this.parseSectionOccurs( idxs ) );
						}
						return children ;
					}else{
						return [] ;
					}
				}else if( subProgram.parent != "" ){
					return this.getVariableChildren( nameId , subProgram.parent , programName )
				}else{
					throw (`Error: ${name} not found in children request`);
				}
			}else{
				throw (`Error: ${programName}::${functionId} not found in children request`);
			}
	}

	getProgramByAbsoluteLine( absoluteLine : number ){
		let findProgram : SymbolProgramCobol ;
		this.listSubProgram.forEach((program)=>{
			if(absoluteLine >= program.lineTop && absoluteLine <= program.lineBack )
				return findProgram = program ;
		});
		return findProgram ;
	}

	getAbsoluteLine( filePath : string , line : number ) : number {
		const key = Path.win32.normalize(filePath).toLowerCase() + ":" + line ;
		return this.filesMap.get( key ) ;
	}

	getAddress( filePath : string , line : number  ){
		const filePathRelaive = Path.win32.relative(this.sourceDir , filePath).toLowerCase();
		const absLine = this.getAbsoluteLine( filePathRelaive , line )	;
		if( absLine && this.lineInfo.get(absLine) && this.addressBase > 0 )
			return this.lineInfo.get(absLine).offset + this.addressBase ;
		else
			return -1 ;
	}

	getFileAndLine( address : number ) : { file: string , line: number  } {
		let offset = address - this.addressBase 
		while( !this.addrMap.get(offset) ) offset--;
		const fileAndLine = this.addrMap.get(offset) ;
		const filePath = this.sourceDir + "\\" + fileAndLine.split(":")[0];
		const fileLine = parseInt(fileAndLine.split(":")[1]);
		return { 
			file: filePath , 
			line: fileLine 
		};
	}

	getAllEntry(){
		return Array.from(this.listSubProgram).map( (program)=>{
			return this.addressBase + program[1].from ;
		});
	}

	getStep( address : number , isStepIn ) : [ number[] , boolean ]{
		let offset = address - this.addressBase 
		while( !this.offsetToLineInfo.has(offset) ) offset--; 

		const lineInfo = this.offsetToLineInfo.get( offset );
		const isBound = lineInfo.isBound ;
		let steps = [] ;
		if( !isBound ){
			steps = lineInfo.step.map( (offsetStep)=>{ return this.addressBase + offsetStep } ) ;
			if( isStepIn ){
				lineInfo.stepIn.forEach(( offsetStep )=>{ steps.push( this.addressBase + offsetStep ) } );
				this.getAllEntry().forEach( (lineAddress)=> { steps.push( lineAddress ) } );
			}
		}
		return [ steps , isBound ] ;
	}

	getNearBound( address : number ) : number {
		let offset = address - this.addressBase 
		while( !this.offsetToLineInfo.has(offset) )	offset--;
		let lineInfo = this.offsetToLineInfo.get( offset ) ;
		return lineInfo.stepOut + this.addressBase ;
	}

	isMe( address : number ){
		if( address > this.addressBase && address < this.addressBase + this.codeSize )
			return true;
		else
			return false;
	}

	setAddressBase( entry : string , address : number ){
		if( address > 0 && this.entrys.has( entry ))
			this.addressBase = address - this.entrys.get( entry ) ;
	}

	getAddressBase() : number {
		return this.addressBase ;
	}
}