       
      *>-----------------------------------------------------------
      *> Class description
      *>-----------------------------------------------------------
       class-id. newClassII data is protected
                 inherits from newClass with data.

       object section.
       class-control.
           newClass is class "newclass"
      *> OCWIZARD - start list of classes
           base is class "base"
      *> OCWIZARD - end list of classes
      *>---USER-CODE. Add any additional class names below.

           .

      *>-----------------------------------------------------------
       working-storage section. *> Definition of global data
      *>-----------------------------------------------------------
       01 global-vars.
           02 glb-int1     pic x(4) comp-5.
           02 glb-int2     pic x(4) comp-5.
           02 glb-int3     pic x(4) comp-5.

           02 glb-str1     pic x(20).
           02 glb-str2     pic x(20).

      *>-----------------------------------------------------------
       class-object.   *> Definition of class data and methods
      *>-----------------------------------------------------------
       object-storage section.

      *> OCWIZARD - start standard class methods
      *> OCWIZARD - end standard class methods

      *>---------------------------------------------------------------
       method-id. "new".
       local-storage Section.
       01  ls-ptr      pointer.
       01  ls-str      pic x(20).
       01  ls-big      pic x(4) comp-x.
      *>---USER-CODE. Add any local storage items needed below.
       linkage Section.
       01 lnkreturn              object reference.

       procedure division returning lnkreturn.

           display "hello my class"
           set ls-ptr to  address of lnkreturn
           set ls-ptr to address of self
           set ls-ptr to address of selfClass
           move 1234 to ls-big

           invoke super "new" returning lnkreturn.
           move 1 to glb-int1.
           move 2 to glb-int2.
           move 3 to glb-int3.

           move "texto 1" to glb-str1.
           move "texto 2" to glb-str2.
           move glb-str1  to ls-str

           invoke lnkreturn "setInts" using  glb-int1 glb-int2 value 1
                                      returning return-code 

       exit method.
       end method "new".
      *>---------------------------------------------------------------


       end class-object.

      *>-----------------------------------------------------------
       object.         *> Definition of instance data and methods
      *>-----------------------------------------------------------
       object-storage section.
      *> OCWIZARD - start standard instance methods
      *> OCWIZARD - end standard instance methods



      *>---------------------------------------------------------------
       method-id. "setInts".
       local-storage Section.
       01  ls-class-str   pic  x(20).
       01  ls-class-aux   pic  x(4) comp-5.
       01  ls-class-float comp-2.
      *>---USER-CODE. Add any local storage items needed below.
       linkage Section.
       01 lnkInt1                pic x(4) comp-5.
       01 lnkInt2                pic x(4) comp-5.
       01 lnkInt3                pic x(4) comp-5.
       01 lnkreturn              pic x(4) comp-5.

       procedure division using lnkInt1 lnkInt2 value lnkInt3
                          returning lnkreturn.

      *>---USER-CODE. Add method implementation below.
           move 1234         to ls-class-aux 
           move 0.432        to ls-class-float
           move "I am class" to ls-class-str 
           move lnkInt1 to glb-int1
           move lnkInt2 to glb-int2
           move lnkInt3 to glb-int3                                     
           move 1 to lnkreturn

       exit method.
       end method "setInts".
      *>---------------------------------------------------------------


      *>---------------------------------------------------------------
       method-id. "getMedia".
       local-storage Section.
      *>---USER-CODE. Add any local storage items needed below.
       linkage Section.
       01 lnkMedia               pic x(4) comp-5.

       procedure division returning lnkMedia.

      *>---USER-CODE. Add method implementation below.

       exit method.
       end method "getMedia".
      *>---------------------------------------------------------------


       end object.

       end class newClassII.
