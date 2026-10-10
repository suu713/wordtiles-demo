"""Explicit target-word decisions; not a general English morphology analyzer."""
# Exclude grammatical inflections and, conservatively, conspicuous past-form homographs.
INFLECTION_GROUPS = {
 'BE':'AM ARE IS WAS WERE BEEN BEING', 'EAT':'ATE EATEN', 'BEGIN':'BEGAN BEGUN',
 'GOOD':'BETTER BEST', 'BIG':'BIGGER BIGGEST', 'BITE':'BIT BITTEN', 'BEAR':'BORE BORN BORNE',
 'BIND':'BOUND', 'BREAK':'BROKE BROKEN', 'BUILD':'BUILT BUILDING', 'COME':'CAME',
 'CAN':'COULD', 'CROP':'CROPS', 'DATE':'DATED', 'DEAL':'DEALT', 'DO':'DID DOES DONE DOING',
 'DRINK':'DRANK DRUNK', 'DRAW':'DREW DRAWN DRAWING', 'DRY':'DRIED', 'DRIVE':'DROVE DRIVEN DRIVING',
 'DIG':'DUG', 'OLD':'ELDER ELDERS OLDER OLDEST', 'FEED':'FED', 'FOOT':'FEET',
 'FALL':'FELL FALLEN', 'FEEL':'FELT FEELING', 'FEW':'FEWER FEWEST', 'FLY':'FLEW FLOWN',
 'FIND':'FOUND', 'FRY':'FRIED', 'GIVE':'GAVE GIVEN', 'GO':'GOES GOING GONE WENT',
 'GET':'GOT GOTTEN', 'GROW':'GREW GROWN', 'HAVE':'HAD HAS', 'HEAR':'HEARD HEARING',
 'HOLD':'HELD', 'HIDE':'HID HIDDEN', 'KEEP':'KEPT', 'KNOW':'KNEW KNOWN',
 'LAY':'LAID', 'LIE':'LAY LAIN', 'LATE':'LATER LATEST', 'LITTLE':'LESS LEAST',
 'LEAD':'LED', 'LEAVE':'LEFT LEAVES', 'LEND':'LENT', 'LIKE':'LIKED', 'LIGHT':'LIT',
 'LOSE':'LOST', 'LOW':'LOWER LOWEST', 'MAKE':'MADE', 'MEAN':'MEANT MEANING', 'MAN':'MEN',
 'MEET':'MET MEETING', 'MOUSE':'MICE', 'MAY':'MIGHT', 'MUCH':'MORE MOST',
 'NEW':'NEWER NEWEST', 'NOTE':'NOTED', 'OAT':'OATS', 'PAY':'PAID',
 'RUN':'RAN RUNNING', 'RING':'RANG RUNG', 'RATE':'RATED RATING RATES',
 'RISE':'ROSE RISEN', 'RIDE':'RODE RIDDEN RIDING', 'ROOT':'ROOTS', 'SAY':'SAID',
 'SING':'SANG SUNG SINGING', 'SIT':'SAT SITTING', 'SEE':'SAW SEEN SEEING',
 'SEND':'SENT', 'SHAKE':'SHOOK SHAKEN', 'SHOOT':'SHOT', 'SHOW':'SHOWN',
 'SLEEP':'SLEPT SLEEPING', 'SLIDE':'SLID', 'SELL':'SOLD', 'SPEND':'SPENT',
 'SPEAK':'SPOKE SPOKEN', 'STAND':'STOOD', 'SWEEP':'SWEPT', 'SWIM':'SWAM SWUM SWIMMING',
 'TAKE':'TOOK TAKEN', 'TOOTH':'TEETH', 'THROW':'THREW THROWN', 'TIE':'TIED',
 'TIRE':'TIRED', 'TELL':'TOLD', 'TEAR':'TORE TORN', 'TRY':'TRIED TRIES TRYING',
 'USE':'USED USES USING', 'WAKE':'WOKE WOKEN', 'WOMAN':'WOMEN', 'WIN':'WON',
 'WEAR':'WORE WORN', 'BAD':'WORSE WORST', 'WILL':'WOULD', 'WIND':'WOUND',
 'WEAVE':'WOVEN WOVE', 'WRITE':'WROTE WRITTEN WRITING', 'CHILD':'CHILDREN',
 'GOOSE':'GEESE', 'OX':'OXEN', 'DIE':'DICE', 'DATUM':'DATA', 'MEDIUM':'MEDIA',
 'THIS':'THESE', 'THAT':'THOSE', 'CAT':'CATS', 'DOG':'DOGS', 'APPLE':'APPLES',
 'BOOK':'BOOKS', 'TREE':'TREES', 'PLAY':'PLAYED PLAYING PLAYS', 'WALK':'WALKED WALKING WALKS',
 'CATCH':'CATCHES CAUGHT', 'CARRY':'CARRIED CARRIES CARRYING', 'HAPPY':'HAPPIER HAPPIEST',
 'SMALL':'SMALLER SMALLEST', 'QUICK':'QUICKER QUICKEST', 'FAST':'FASTER FASTEST',
 'YOUNG':'YOUNGER YOUNGEST', 'LARGE':'LARGER LARGEST', 'CLASS':'CLASSES', 'GLASS':'GLASSES',
 'BUS':'BUSES', 'STUDY':'STUDIES', 'COOK':'COOKED COOKING', 'BAKE':'BAKED BAKING',
 'DANCE':'DANCED DANCING', 'SHOP':'SHOPPING', 'FISH':'FISHING', 'HUNT':'HUNTING',
 'BANK':'BANKING', 'OFFER':'OFFERING', 'OPEN':'OPENING', 'GATHER':'GATHERING',
 'GREET':'GREETING', 'WARN':'WARNING', 'TRAIN':'TRAINING', 'LEARN':'LEARNED LEARNING',
 'WORK':'WORKING WORKED', 'UNDERSTAND':'UNDERSTOOD UNDERSTANDING',
 'TRADE':'TRADING', 'REASON':'REASONING', 'DRESS':'DRESSING', 'BREATHE':'BREATHING',
 'INTEREST':'INTERESTED INTERESTING', 'LIMIT':'LIMITED', 'LOVE':'LOVING',
 'CHARM':'CHARMING', 'STRIKE':'STRIKING', 'PREFER':'PREFERRED', 'SWELL':'SWOLLEN',
 'WILL':'WOULD WILLING', 'ANIMATE':'ANIMATED', 'AMUSE':'AMUSING', 'COLOR':'COLORED',
 'DARE':'DARING', 'FIT':'FITTING', 'AMAZE':'AMAZED AMAZING', 'CONFUSE':'CONFUSED',
 'SCATTER':'SCATTERED', 'MARRY':'MARRIED', 'PARK':'PARKING', 'AGE':'AGED',
}
# Closed grammatical or potentially confusing surface forms, not claims of invalid English.
FORM_HOLDOUT = '''OUGHT UPPER FURTHER FARTHER DRUNKEN CLOTHING CUNNING SKILLED WRINKLED TALENTED
UNEXPECTED UNKNOWN UNCONSCIOUS HANDWRITTEN HANDMADE HOMEMADE CROOKED WEDDING'''.split()
PRONOUN_FORMS = '''HER HIM HIS OUR OURS THEIR THEIRS THEM YOUR YOURS WHOSE WHOM HERSELF HIMSELF
ITSELF MYSELF OURSELVES THEMSELVES YOURSELF YOURSELVES'''.split()
OTHER_HOLDOUT = {
 'NAT':'abbreviation_or_name', 'TEL':'abbreviation', 'DELL':'low_salience_common_sense_or_brand',
 'EVE':'name_or_context_salience', 'EWE':'less_immediate_short_word', 'YAW':'technical_short_word',
 'YAP':'colloquial_short_word','ZAP':'colloquial_short_word','HENCE':'formal_connector',
 'FORTH':'formal_connector','LAD':'regional_or_dated_salience','PEAT':'less_immediate_short_word',
 'FIR':'less_immediate_short_word','RYE':'less_immediate_short_word','OAT':'usually_seen_as_plural',
 'CIVIC':'abstract_or_brand_salience','NAVAL':'specialized_adjective','LIAR':'negative_role_holdout',
 'LORD':'formal_title','NUN':'religious_role_holdout','PRAY':'religious_theme_holdout',
 'SUE':'name_or_legal_salience','SUB':'ambiguous_shortened_form','EATER':'low_salience_agent_noun',
 'JOKER':'role_or_card_salience','NAIVE':'spelling_diacritic_variant','IVORY':'less_immediate_material',
 'SOW':'ambiguous_pronunciation','ROB':'name_or_crime_salience','RAP':'short_word_polysemy',
 'CREST':'less_immediate_noun','LEA':'low_salience_word','WED':'abbreviation_or_verb_ambiguity',
 'VIA':'formal_connector','SHALL':'formal_modal','PER':'short_form_ambiguity','HERON':'less_immediate_bird',
 'RAM':'acronym_or_animal_ambiguity','NATO':'acronym','NASA':'acronym','FBI':'acronym','CPU':'acronym',
 'ROM':'acronym','USB':'acronym','HTML':'acronym','HTTP':'acronym','URL':'acronym','LOL':'acronym',
 'OMG':'acronym','BTW':'acronym','ETC':'abbreviation','EST':'abbreviation','RE':'fragment','DE':'fragment','LA':'fragment',
 'CATTLE':'plural_only_collective','SCISSORS':'plural_only_noun','BINOCULAR':'usually_seen_as_plural',
 'PAJAMA':'usually_seen_as_plural','MONDAY':'proper_calendar_name','SATURDAY':'proper_calendar_name',
 'LIVINGROOM':'not_standard_single_word','COPYWRITER':'specialist_profession','QUIBBLE':'less_immediate_verb',
 'QUIVER':'less_immediate_noun_or_verb','QUADRANGLE':'technical_noun','ZOOLOGY':'specialist_subject',
 'CHOLESTEROL':'medical_noun','INTIMATE':'adult_context_holdout','SPOUSE':'formal_noun','SERENE':'less_immediate_adjective',
 'CIVILIAN':'military_context','JOYLESS':'less_immediate_derivative','WOOLEN':'regional_spelling_holdout',
}
EXCLUSIONS={}
for lemma,forms in INFLECTION_GROUPS.items():
 for form in forms.split(): EXCLUSIONS[form]={'reason':'inflection_or_strict_homograph','base':lemma}
for form in FORM_HOLDOUT: EXCLUSIONS[form]={'reason':'strict_form_holdout','base':None}
for form in PRONOUN_FORMS: EXCLUSIONS[form]={'reason':'pronoun_case_or_possessive','base':None}
for form,reason in OTHER_HOLDOUT.items(): EXCLUSIONS[form]={'reason':reason,'base':None}
EXCLUSIONS['MATHEMATICS']={'reason':'plural_surface_specialist_holdout','base':None}
