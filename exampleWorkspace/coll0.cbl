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
      $SET NORETRYLOCK NODETECTLOCK
       IDENTIFICATION DIVISION.
      *COPY DSLANG.CPY.
       PROGRAM-ID. COLL0.
       ENVIRONMENT DIVISION.

       special-names.
           call-convention 6 is wapi.

       class-control.
           OrderedCollection is class "ordrdcll"
           Bag is class "bag"
           SortedCollection is class "srtdclln"
           CharacterArray is class "chararry"
           ValueSet is class "valueset"
           newClass is class "newclassii"
           .

       working-storage section.
       01  prt-aux             usage procedure-pointer.
       
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
               03 filler.
                   04  filler pic x(20) value "Mango".
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
           01  var-text                pic x(20). 
           01 grupo.  
               02  var-num                 pic 9(05).  
               02  var-num2                pic 9(05).  
               02 .
                   03  sub-grupo occurs 10 times .
                    04 sub-var             pic 9(3).
           01  ws-float       comp-2.

           01 tab-tst occurs 2 times.
               02 var-id    pic  9.
               02 var-tst pic x(20) occurs 2 times.
           copy copybooks\tst_var.cpy.      

       procedure division.


       run-transaction section.
           set prt-aux to entry "USER32"
      *----A001. Create an array of 10 elements.
           move zeros to var-num
           move 1234  to var-num2
           move 999 to sub-var(2)
           move 0.1234 to ws-float

           move 3 to var-id(1)
           move 6 to var-id(2)
           move "element 1" to var-tst(2,1)
           move "element 2" to var-tst(2,2)
           
           display "bkp: 1"

           display "bkp: 2"
       
           call "program1"

           *>call wapi "RaiseException" using value 1234 1 1 '
           *>                                reference z"errooooor"

           invoke newClass "new" returning anOrderedCollection

           move 10 to i loopCount
      *----A002. Create an ordered collection.
           invoke OrderedCollection "ofReferences"
                                    using i
                                RETURNING ANORDEREDCOLLECTION
      *----A003. Create a sorted collection
           invoke SortedCollection "ofReferences" using i
                                          returning aSortedCollection
      *----A004. Create a bag.
           invoke Bag "ofreferences" using i
                                 returning aBag
      *----A005. Create a ValueSet.
           invoke ValueSet "ofReferences" using i
                                      returning aValueSet
      *----A006. Store CharacterArray instances for the strings declared
      *          in working storage.
           move 20 to i
           perform varying loopCount from 1 by 1
                                     until loopCount > 10
      *--------A007. Create a CharacterArray for each of the data items
      *        in the table. CharacterArrays are used for holding and
      *        manipulating strings.
               invoke CharacterArray "withByteLengthValue"
                      using i collectionData(loopCount)
                  returning aString
      *--------A008. Store the string in each collection.
               invoke aValueSet "add" using aString
                                  returning aString
               invoke aBag "add" using aString
                             returning aString
      *--------A009. Although the OrderedCollection and SortedCollection
      *              are indexed, when these collections are empty you
      *              have to "add" the new elements.
               invoke anOrderedCollection "add" using aString
                                            returning aString
               invoke aSortedCollection "add" using aString
                                          returning aString
           end-perform

           copy copybooks\tst_proc.cpy.

      *----A011. Bags are not indexed, so ask the bag if it includes an
      *    element with the value of aString. You query a ValueSet in
      *    the same way.
           invoke aBag "includes" using aString
                              returning trueOrFalse
           if isTrue
               display  "Bag contains " with no advancing
               invoke aString "display"
           else
               display  "Bag does not contain " with no advancing
               invoke aString "display"
           end-if
           display " "
      *----A012. Bags (unlike ValueSets) allow duplicates. You can
      *          add a second occurrence of the element.
           invoke aBag "add" using aString
                         returning aString
      *----A013. You can ask a bag how many occurrences it
      *    contains of a particular element.
           invoke aBag "occurrencesOf" using aString
                                   returning i
           display "Bag contains " i " occurrences of "
                   with no advancing
           invoke aString "display"
           display " ".

           perform procedure-teste.
           stop run.
       
       procedure-teste.

           display "bkp: 3"

      *----A015. The next statement adds a second occurrence of aString
      *           to the ValueSet. ValueSets do not maintain duplicates,
      *           so when we query the ValueSet it will still return 1.
           invoke aValueSet "add" using aString
                              returning aString
           invoke aValueSet "occurrencesOf" using aString returning i
           display "ValueSet contains " i " occurrences of "
                   with no advancing
           invoke aString "display"
           display " "
      *----A016. Display the entire contents of the sorted and ordered
      *    collections, to show the different order of aStrings.
           display "Collection contents"
           display "Ordered:            Sorted:"
           perform varying loopCount from 1 by 1 until loopCount > 10
               invoke anOrderedCollection "at" using loopCount
                                           returning aString
               invoke aString "display"
               invoke aSortedCollection "at" using loopcount
                                         returning aString
               invoke aString "display"
               display " "
           end-perform
           exit.
       .
       second section.
       my-procedure-test1.
           display "teste 1"
       .
       my-procedure-test2.
           display "teste 2" 

       program-id. subprogram.
       data division.
       working-storage section.
       77  var-sub-program-1 pic x(20).
       77  var-sub-program-2 pic x(20).
       procedure division.
           display "subprogram".
       end program subprogram.
       end program coll0.
