#include <stdio.h>

void c_print( char * msg ){
    char * _msg = msg ;
    if( msg != NULL ){
        printf("C lang: %s ",msg);
    }
}
