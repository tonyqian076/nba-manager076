window.PLAYER_POOL = {
  ageByName: {
  "Jayson Tatum": 27, "Jaylen Brown": 29, "Derrick White": 31, "Jrue Holiday": 35, "Kristaps Porzingis": 30,
  "Jalen Brunson": 29, "Karl-Anthony Towns": 30, "OG Anunoby": 28, "Mikal Bridges": 29, "Josh Hart": 31,
  "Giannis Antetokounmpo": 31, "Damian Lillard": 35, "Khris Middleton": 34, "Brook Lopez": 38,
  "Donovan Mitchell": 29, "Evan Mobley": 24, "Darius Garland": 26, "Jarrett Allen": 27,
  "Shai Gilgeous-Alexander": 27, "Jalen Williams": 25, "Chet Holmgren": 24, "Luguentz Dort": 27,
  "Nikola Jokic": 31, "Jamal Murray": 29, "Aaron Gordon": 30, "Michael Porter Jr.": 27,
  "LeBron James": 41, "Luka Doncic": 27, "Austin Reaves": 28, "Rui Hachimura": 28,
  "Anthony Edwards": 24, "Julius Randle": 31, "Rudy Gobert": 33, "Jaden McDaniels": 25
},
  teams: [
  { id: "bos", name: "Boston Celtics", conf: "East", color: "#007a33" },
  { id: "nyk", name: "New York Knicks", conf: "East", color: "#f58426" },
  { id: "mil", name: "Milwaukee Bucks", conf: "East", color: "#00471b" },
  { id: "cle", name: "Cleveland Cavaliers", conf: "East", color: "#6f263d" },
  { id: "okc", name: "Oklahoma City Thunder", conf: "West", color: "#007ac1" },
  { id: "den", name: "Denver Nuggets", conf: "West", color: "#0e2240" },
  { id: "lal", name: "Los Angeles Lakers", conf: "West", color: "#552583" },
  { id: "min", name: "Minnesota Timberwolves", conf: "West", color: "#236192" }
],
  rosters: {
  bos: [
    ["Jayson Tatum", "F", 91, 86, 88, 84, 86, 89, 83, 24],
    ["Jaylen Brown", "G/F", 88, 84, 83, 83, 82, 84, 82, 22],
    ["Derrick White", "G", 76, 84, 79, 88, 80, 82, 86, 13],
    ["Jrue Holiday", "G", 74, 80, 78, 90, 88, 85, 80, 12],
    ["Kristaps Porzingis", "C", 86, 84, 84, 77, 74, 78, 72, 19],
    ["Payton Pritchard", "G", 69, 82, 70, 75, 69, 72, 88, 5],
    ["Sam Hauser", "F", 63, 81, 68, 72, 64, 68, 86, 4],
    ["Neemias Queta", "C", 73, 54, 78, 67, 61, 60, 83, 3]
  ],
  nyk: [
    ["Jalen Brunson", "G", 86, 88, 72, 77, 87, 88, 84, 21],
    ["Karl-Anthony Towns", "C", 90, 87, 80, 71, 78, 82, 78, 23],
    ["OG Anunoby", "F", 76, 82, 83, 89, 72, 76, 80, 16],
    ["Mikal Bridges", "F", 75, 82, 80, 85, 76, 80, 91, 15],
    ["Josh Hart", "G/F", 72, 71, 79, 81, 78, 81, 87, 10],
    ["Mitchell Robinson", "C", 80, 42, 88, 75, 64, 64, 70, 7],
    ["Miles McBride", "G", 62, 76, 70, 80, 65, 70, 88, 5],
    ["Precious Achiuwa", "F/C", 72, 55, 78, 72, 62, 64, 81, 4]
  ],
  mil: [
    ["Giannis Antetokounmpo", "F", 96, 67, 90, 84, 91, 92, 80, 24],
    ["Damian Lillard", "G", 76, 93, 67, 70, 88, 91, 78, 22],
    ["Khris Middleton", "F", 77, 84, 75, 76, 82, 83, 70, 14],
    ["Brook Lopez", "C", 79, 77, 88, 72, 76, 78, 79, 13],
    ["Bobby Portis", "F/C", 79, 75, 76, 70, 72, 75, 83, 9],
    ["Gary Trent Jr.", "G", 64, 79, 66, 73, 64, 70, 82, 6],
    ["Taurean Prince", "F", 66, 76, 72, 74, 67, 70, 83, 4],
    ["AJ Green", "G", 58, 81, 62, 68, 58, 62, 85, 3]
  ],
  cle: [
    ["Donovan Mitchell", "G", 84, 90, 72, 78, 86, 90, 82, 22],
    ["Evan Mobley", "F/C", 83, 72, 91, 82, 78, 80, 85, 16],
    ["Darius Garland", "G", 72, 87, 64, 73, 80, 86, 80, 14],
    ["Jarrett Allen", "C", 86, 35, 90, 75, 74, 76, 86, 13],
    ["Max Strus", "G/F", 66, 80, 70, 74, 67, 72, 82, 8],
    ["De'Andre Hunter", "F", 73, 78, 76, 77, 70, 73, 78, 9],
    ["Isaac Okoro", "G/F", 62, 68, 76, 81, 64, 66, 84, 6],
    ["Sam Merrill", "G", 54, 82, 58, 66, 57, 62, 84, 3]
  ],
  okc: [
    ["Shai Gilgeous-Alexander", "G", 90, 88, 80, 84, 90, 93, 86, 23],
    ["Jalen Williams", "F", 83, 82, 78, 82, 80, 84, 87, 15],
    ["Chet Holmgren", "C", 84, 80, 92, 78, 78, 82, 79, 12],
    ["Luguentz Dort", "G/F", 68, 77, 78, 88, 74, 75, 86, 10],
    ["Isaiah Hartenstein", "C", 78, 45, 85, 74, 73, 74, 82, 12],
    ["Cason Wallace", "G", 64, 76, 73, 82, 65, 70, 88, 5],
    ["Aaron Wiggins", "G/F", 68, 74, 70, 75, 65, 69, 86, 4],
    ["Isaiah Joe", "G", 55, 84, 58, 68, 59, 64, 86, 4]
  ],
  den: [
    ["Nikola Jokic", "C", 96, 89, 86, 75, 94, 96, 88, 24],
    ["Jamal Murray", "G", 79, 88, 68, 76, 83, 87, 76, 18],
    ["Aaron Gordon", "F", 84, 64, 84, 82, 78, 78, 81, 14],
    ["Michael Porter Jr.", "F", 75, 88, 74, 71, 70, 79, 78, 17],
    ["Christian Braun", "G/F", 70, 72, 75, 80, 68, 72, 86, 7],
    ["Peyton Watson", "F", 67, 64, 82, 78, 62, 66, 83, 5],
    ["Julian Strawther", "G/F", 60, 78, 64, 68, 58, 64, 84, 3],
    ["Zeke Nnaji", "F/C", 68, 62, 72, 68, 58, 62, 79, 4]
  ],
  lal: [
    ["LeBron James", "F", 89, 85, 78, 77, 96, 92, 70, 23],
    ["Luka Doncic", "G/F", 88, 91, 73, 72, 92, 95, 77, 25],
    ["Austin Reaves", "G", 72, 84, 66, 73, 74, 80, 84, 9],
    ["Rui Hachimura", "F", 78, 77, 73, 69, 66, 72, 80, 8],
    ["Gabe Vincent", "G", 62, 76, 67, 76, 68, 70, 75, 6],
    ["Jarred Vanderbilt", "F", 68, 54, 82, 82, 66, 65, 68, 5],
    ["Jaxson Hayes", "C", 78, 38, 76, 65, 58, 61, 76, 4],
    ["Dalton Knecht", "G/F", 63, 80, 62, 66, 58, 67, 83, 3]
  ],
  min: [
    ["Anthony Edwards", "G", 86, 88, 78, 82, 83, 91, 87, 19],
    ["Julius Randle", "F", 85, 76, 75, 70, 80, 82, 75, 17],
    ["Rudy Gobert", "C", 84, 30, 94, 72, 80, 75, 78, 17],
    ["Jaden McDaniels", "F", 72, 76, 82, 87, 70, 74, 84, 10],
    ["Mike Conley", "G", 62, 82, 66, 76, 86, 78, 76, 8],
    ["Naz Reid", "F/C", 78, 80, 76, 70, 68, 76, 82, 9],
    ["Donte DiVincenzo", "G", 64, 81, 70, 78, 70, 74, 82, 7],
    ["Nickeil Alexander-Walker", "G/F", 62, 76, 70, 78, 66, 70, 85, 5]
  ]
},
  draftProspects: [
    ["Victor Wembanyama", "C", 91, 82, 96, 82, 78, 88, 84, 9],
    ["Trae Young", "G", 70, 92, 58, 65, 86, 90, 80, 8],
    ["Paolo Banchero", "F", 88, 78, 78, 72, 82, 84, 84, 8],
    ["Cade Cunningham", "G", 81, 86, 72, 76, 84, 86, 82, 7],
    ["Scottie Barnes", "F", 82, 74, 84, 82, 82, 80, 84, 7],
    ["Brandon Miller", "F", 76, 86, 74, 78, 72, 82, 86, 6],
    ["Alperen Sengun", "C", 90, 70, 80, 70, 80, 82, 80, 7],
    ["Jalen Green", "G", 78, 86, 64, 70, 68, 82, 82, 6],
    ["Franz Wagner", "F", 82, 82, 78, 80, 76, 82, 86, 6],
    ["Desmond Bane", "G", 72, 89, 72, 78, 74, 84, 82, 6],
    ["Jaren Jackson Jr.", "F/C", 82, 76, 92, 78, 76, 82, 78, 7],
    ["Dejounte Murray", "G", 78, 82, 76, 82, 78, 82, 80, 6],
    ["Zion Williamson", "F", 94, 62, 80, 68, 78, 86, 72, 8],
    ["CJ McCollum", "G", 72, 86, 64, 70, 80, 82, 78, 5],
    ["Tyrese Maxey", "G", 78, 89, 66, 74, 76, 88, 86, 7],
    ["Joel Embiid", "C", 94, 84, 91, 74, 86, 91, 70, 10],
    ["De'Aaron Fox", "G", 84, 84, 70, 78, 80, 88, 84, 7],
    ["Domantas Sabonis", "C", 88, 70, 82, 70, 84, 82, 86, 7],
    ["Lauri Markkanen", "F", 84, 88, 76, 72, 72, 82, 80, 6],
    ["Keyonte George", "G", 68, 82, 62, 70, 66, 76, 86, 4],
    ["Devin Vassell", "G/F", 74, 84, 72, 78, 70, 80, 82, 5],
    ["Jeremy Sochan", "F", 72, 66, 80, 82, 72, 72, 86, 4],
    ["Bam Adebayo", "C", 84, 68, 92, 80, 84, 82, 86, 7],
    ["Tyler Herro", "G", 72, 86, 64, 70, 72, 82, 78, 5],
    ["Jimmy Butler", "F", 82, 76, 84, 86, 92, 90, 74, 7],
    ["Matas Buzelis", "F", 72, 76, 72, 74, 66, 76, 88, 4],
    ["Zach LaVine", "G", 82, 87, 64, 70, 74, 84, 76, 6],
    ["Ausar Thompson", "G/F", 72, 68, 82, 86, 70, 74, 84, 4],
    ["Jalen Duren", "C", 84, 42, 84, 66, 68, 72, 86, 4],
    ["Bilal Coulibaly", "G/F", 68, 74, 76, 82, 66, 74, 88, 4],
    ["Alex Sarr", "C", 76, 70, 86, 74, 66, 76, 86, 4],
    ["Cooper Flagg", "F", 84, 80, 88, 84, 78, 88, 88, 6]
  ]
};
