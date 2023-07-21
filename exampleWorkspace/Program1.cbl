      $set mfoo

      *-------------------------------------------------------------
      * Program to create five different types of collection and
      * initialize with intrinsic values.
      *-------------------------------------------------------------
      * Copyright (C) 1996-2000 MERANT International Ltd. All Rights Reserved
      * This demonstration program is provided for use by users of
      * MERANT products and may be used, modified and
      * distributed as part of your application provided that you
      * properly acknowledge the copyright of MERANT in this
      * material.
      *-------------------------------------------------------------
       class-control.
           OrderedCollection is class "ordrdcll"
           Bag is class "bag"
           SortedCollection is class "srtdclln"
           CharacterArray is class "chararry"
           ValueSet is class "valueset"
           .

       working-storage section.
       01  prt-aux             usage procedure-pointer.

           01 transaction          pic x(80).

           01 stop-flags           pic x(4) comp-5.

           01 argument             pic x(80).

      *----Data for initializing the collections
           01  loopCount               pic x(4) comp-5.
           01  element                 pic x(4) comp-5.
           01  element2                pic x(4) comp-5.
           01  i                       pic x(4) comp-5.

      *----Boolean variable to receive results from some collection
      *    methods.
           01  trueOrFalse             pic x comp-5.
               88  isTrue              value 1.
               88  isFalse             value 0.

      *----Object references to hold collection instances and
      *    a class template for COBOL intrinsic data.
           01  aBag                    object reference.
           01  anOrderedCollection     object reference.
           01  aSortedCollection       object reference.
           01  aString                 object reference.
           01  aValueSet               object reference.
           01  fruitdata.
               03  filler pic x(20) value "Mango".
               03  filler pic x(20) value "Apple".
               03  filler pic x(20) value "Pear".
               03  filler pic x(20) value "Banana".
               03  filler pic x(20) value "Apricot".
               03  filler pic x(20) value "Strawberry".
               03  filler pic x(20) value "Kiwifruit".
               03  filler pic x(20) value "Grape".
               03  filler pic x(20) value "Lemon".
               03  filler pic x(20) value "Orange".

           01  collectionData          pic x(20)
                                       occurs 10 times
                                       redefines fruitData.

           01 grp-aux.
                02 grp-nome pic x(20).
                02 grp-cod  pic 9(03).     

       local-storage section.
       01  ls-aux      pointer.
       01  ls-str      pic x(20).
       procedure division.


       run-transaction section.
           move "componet" to grp-nome 
           move 5489    to grp-cod 
           move "hello world" to ls-str
           set ls-aux to address of grp-nome

           display "I am Cobol DLL"

           goback
       .



