function freeze(value){
  if(value&&typeof value==='object'){
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

// Presentation policy only. Game scoring and tile consumption are independent.
export const ENCOURAGEMENT_CONFIG=freeze({
  version:2,
  combo:{minimumTargets:6,ordinary:3,advancedFirst:5,advancedStep:3},
  longWord:{minimumLength:5},
  recovery:{errors:3,withoutTargetMs:20000},
  bonus:{distinctWords:3},
  almost:{minimumTargets:4,remaining:1},
  banner:{shortLevelMaxTargets:5,shortPerformanceMax:1,longPerformanceMax:2,almostMax:1,minGapMs:8000,durationMs:1100},
  icon:{perLevelMax:1,minGapMs:60000,durationMs:1000},
  priority:['almost','recovery','long','advanced','ordinary'],
  scenes:{
    ordinary:{words:['Nice!','Great!','Nice Work!'],frame:'blue',icon:null},
    advanced:{words:['Fantastic!','Brilliant!','Impressive!'],frame:'purple',icon:null},
    long:{words:['Fantastic!','Brilliant!','Impressive!'],frame:'gold',icon:null},
    recovery:{words:['You Got It!','Well Done!','There You Go!'],frame:'blue',icon:'applause'},
    bonus:{words:['Nice Find!','Clever Find!','Bonus Word!'],frame:'gold',icon:'thumbs'},
    almost:{words:['Almost There!','One to Go!',"You've Got This!"],frame:'purple',icon:null},
  },
});

export const ENCOURAGEMENT_STORAGE_KEY='wordtiles.encouragement.v1';
