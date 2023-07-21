CCB = ../../mf-export-symbols/master/cob.exe
CBFLAGS_EXE = -U"VSCODE_EXE.DIR" -RS 
CBFLAGS_DLL = -U"VSCODE_DLL.DIR" -RS -D 

CB_FLAGS = WB3 WB CSI EDITOR\"MF2\" ENSUITE\"3\" PREPLIST IDXFORMAT\"3\" DATE

RM	= rm -rf
MV	= mv

TARGET = coll0
BRANCH = debug

SRC_FILES = $(filter-out $(TARGET).cbl, $(wildcard *.cbl))
DLL_FILES = $(SRC_FILES:.cbl=.dll)
DLL_LIST := $(patsubst %,$(BRANCH)/%,$(DLL_FILES))

.PHONY: all

all: $(BRANCH)/$(TARGET).exe $(DLL_LIST)

$(BRANCH)/%.exe: %.cbl
	@echo "compiling $*.exe"
	@echo $(CB_FLAGS) > VSCODE_EXE.DIR
	@$(CCB) $(TARGET).cbl $(CBFLAGS_EXE) -O$(BRANCH)/$*.exe >> log.txt
	@$(RM) VSCODE_EXE.DIR 
	@$(RM) .\$(TARGET).obj
	@echo "successfully compiled"

$(BRANCH)/%.dll: %.cbl
	@echo "compiling $*.dll"
	@echo $(CB_FLAGS) > VSCODE_DLL.DIR
	@$(CCB) $*.cbl $(CBFLAGS_DLL) -O$(BRANCH)/$*.dll >> log.txt
	@$(RM) VSCODE_DLL.DIR *.obj
	@echo "successfully compiled"

clean:
	@$(RM) *.idy *.exe *.gnt *.dll *.grp *.obj $(BRANCH)/*.*