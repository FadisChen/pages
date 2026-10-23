// Name groups: language / culture groups, each with male given names (M), female given names (F) and
// family names (S), plus the naming conventions of that culture. Countries map to one or several
// groups weighted by population share (COUNTRY_GROUPS), so a Nigerian life draws a Hausa, Yoruba or
// Igbo name and a Swiss one a German, French or Italian name.
//
// Token formats (words separated by whitespace in the source; `_` stands for a space inside a token):
//   plain        Mary          Jean_Claude
//   a|b          Korean "hangul|hanja" (mode 'ko'), or "masculine|feminine" surname forms (forms: true)
//
// Group options
//   order   'given' (Mary Smith) or 'family' (family name first: 王小明, Nagy Péter, Nguyễn Văn An)
//   sep     separator between family and given name when order is 'family' ('' for CJK)
//   mode    'normal'  given + family name
//           'patro'   the "family" slot is the father's given name (Amharic, Somali, Malay, Tamil ...);
//                     `particle` {M,F} is inserted between (Malay "bin" / "binti"); S is the M list
//           'syll'    no family name: a name of two given-name words (Burmese, Bhutanese)
//           'ko'      Korean: hangul with hanja in brackets
//   forms   true: surname tokens are "masculine|feminine"
//   mid     {M,F}: a fixed middle word (Sikh "Singh" / "Kaur")
//   singleP probability of a single name without a family name (Indonesia)
//   maiden  true: the mother keeps her own family name (parents' names; most of East Asia, Iberia, Arab world)
//
// Names are stored as the player sees them (simplified Chinese for CHN, traditional for TWN/HKG/MAC,
// Japanese kanji, hangul + hanja for Korea, Latin transliteration elsewhere).

const w = (s) => s.trim().split(/\s+/).map((t) => t.replace(/_/g, ' '));

export const GROUPS = {
  zh_hans: {
    label: '華語（簡體，中國大陸）', cat: 'East Asia', order: 'family', sep: '', maiden: true,
    M: w(`伟 强 磊 军 勇 杰 涛 明 浩然 子轩 宇航 俊杰 博文 志强 建国 建军 国华 海洋 天宇 梓豪 子涵 一鸣 嘉豪 宏伟 文博 思远 晨曦 志远 振华 立新`),
    F: w(`芳 娜 敏 静 丽 秀英 桂英 玉兰 欣怡 梓涵 雨萱 子怡 诗涵 若曦 紫萱 佳琪 梦洁 雅琪 晓红 小燕 淑珍 美玲 慧敏 婷婷 思琪 可馨 晓雯 秋菊 春梅 海燕`),
    S: w(`王 李 张 刘 陈 杨 黄 赵 吴 周 徐 孙 马 朱 胡 郭 何 高 林 罗 郑 梁 谢 宋 唐 许 韩 冯 邓 曹 彭 曾 萧 田 董 袁 潘`),
  },
  zh_hant: {
    label: '華語（繁體，台港澳）', cat: 'East Asia', order: 'family', sep: '', maiden: true,
    M: w(`志明 家豪 建宏 俊傑 宗翰 柏翰 承恩 冠宇 彥廷 宇軒 哲維 子豪 明德 國強 文傑 偉倫 浩然 立偉 書豪 信宏 榮華 大偉 一鳴 嘉樂 啟聖 子軒 品睿 昱翔 志偉 振華 博文 天佑`),
    F: w(`淑芬 雅婷 怡君 佩珊 欣怡 靜宜 詩涵 宜蓁 雨婷 美玲 秀英 惠雯 曉晴 佳穎 玉蘭 麗華 心怡 家瑜 芷涵 思穎 瑞芳 婉如 雅雯 紫涵 若彤 玉珍 嘉欣 慧敏 語嫣 梓晴 敏君 翠萍`),
    S: w(`陳 林 黃 張 李 王 吳 劉 蔡 楊 許 鄭 謝 郭 洪 曾 邱 廖 賴 徐 周 葉 蘇 莊 呂 江 何 蕭 羅 高 潘 簡 朱 鍾`),
  },
  ja: {
    label: '日語', cat: 'East Asia', order: 'family', sep: '',
    M: w(`蓮 湊 大翔 陽翔 悠真 樹 颯太 健太 翔太 拓海 大輝 隼人 直樹 誠 和也 浩二 達也 康平 雄一 修 剛 裕太 光 一郎 龍之介 慎吾 智也 圭介 亮 勇気 秀樹 政男`),
    F: w(`葵 結衣 陽菜 莉子 美咲 凛 芽依 紬 愛 さくら 彩花 優花 千尋 真由美 恵子 由美 久美子 裕子 智子 明美 加奈 沙織 理恵 菜々子 美穂 楓 花音 里奈 麻衣 春香 典子 幸子`),
    S: w(`佐藤 鈴木 高橋 田中 伊藤 渡辺 山本 中村 小林 加藤 吉田 山田 佐々木 山口 松本 井上 木村 林 清水 山崎 阿部 森 池田 橋本 石川 前田 藤田 小川 後藤 岡田 長谷川`),
  },
  ko: {
    label: '韓語', cat: 'East Asia', order: 'family', sep: '', mode: 'ko', maiden: true,
    M: w(`민준|民俊 서준|瑞俊 도윤|道允 지훈|志勳 현우|賢宇 준호|俊昊 성민|成敏 동현|東賢 재원|宰源 상우|尙宇 태양|太陽 영수|永洙 정훈|廷勳 승현|承賢 기범|基範 우진|宇鎭 철수|哲洙 대호|大浩 병철|炳哲 진우|鎭宇 경수|京洙 한솔|한솔 민석|民錫 용준|龍俊 석진|錫珍 재현|在賢 지환|志煥 형준|亨俊 태민|泰民 수빈|秀彬 건우|建雨`),
    F: w(`서연|瑞妍 하윤|夏潤 지우|智雨 서윤|瑞潤 수아|秀雅 지민|智敏 예은|藝恩 채원|彩媛 민지|珉智 유진|裕眞 은지|恩智 혜진|惠珍 수진|秀珍 영희|英姬 미경|美京 순자|順子 정숙|貞淑 지은|智恩 소연|素妍 다은|多恩 하은|河恩 윤아|潤我 보라|寶羅 나연|娜姸 가영|佳英 선영|善英 현주|賢珠 은서|恩瑞 아영|雅英 시은|始恩 유나|裕娜`),
    S: w(`김|金 이|李 박|朴 최|崔 정|鄭 강|姜 조|趙 윤|尹 장|張 임|林 한|韓 오|吳 서|徐 신|申 권|權 황|黃 안|安 송|宋 류|柳 홍|洪 전|全 고|高 문|文 양|梁 손|孫 배|裵 백|白 허|許 남|南 노|盧 하|河 곽|郭`),
  },
  mn: {
    label: '蒙古語', cat: 'East Asia', order: 'family', sep: ' ', maiden: true,
    M: w(`Bat-Erdene Ganbold Enkhbayar Munkhbat Temuulen Batbayar Erdenebat Naranbaatar Tsogt Dorj Bold Sukhbaatar Otgonbayar Gantulga Altangerel Baasan Davaa Khurelsukh Tuvshin Amarbayasgalan Byambaa Chinbat Nyamdorj Lkhagva Ariunbold Batsaikhan Zorigt Erdenebileg Tumurbaatar`),
    F: w(`Oyun Narantsetseg Sarnai Munkhtsetseg Enkhtuya Altantsetseg Bolormaa Oyuntuya Saruul Tsetseg Khongorzul Yesui Anu Solongo Badamtsetseg Nomin Ariunaa Dolgion Gerel Odgerel Tuyaa Bayarmaa Chimgee Enkhjargal Uyanga Dulamsuren Tselmeg Munkhzul Khulan Narmandakh`),
    S: w(`Batyn Ganboldyn Dorjiin Tsogtyn Erdeniin Naranii Boldyn Sukhiin Enkhiin Munkhiin Baataryn Davaagiin Altany Tumuryn Chimediin Nyamyn Purevyn Lkhagvyn Tserenii Damdiny Jamtsyn Gombyn Luvsany Sandagiin Byambyn Bayaryn Otgony Chuluuny Dashiin`),
  },
  vi: {
    label: '越南語', cat: 'Southeast Asia', order: 'family', sep: ' ', maiden: true,
    M: w(`Văn_An Minh_Quân Hoàng_Nam Quốc_Anh Đức_Huy Thanh_Tùng Văn_Hùng Anh_Tuấn Việt_Dũng Hữu_Phước Ngọc_Sơn Công_Minh Trung_Kiên Thành_Long Gia_Bảo Đình_Khoa Xuân_Trường Văn_Thắng Hải_Đăng Quang_Vinh Tiến_Đạt Bảo_Long Văn_Lâm Khánh_Duy Minh_Khôi Văn_Toàn Hồng_Phúc Thế_Anh Văn_Cường Đăng_Khoa`),
    F: w(`Thị_Lan Thu_Hà Ngọc_Anh Thị_Hoa Minh_Thư Khánh_Linh Thị_Mai Bảo_Ngọc Thanh_Hương Thị_Thảo Hồng_Nhung Phương_Anh Thùy_Linh Thu_Trang Kim_Ngân Diệu_Linh Thị_Hạnh Ngọc_Mai Thị_Hương Quỳnh_Anh Mỹ_Linh Hoài_An Thanh_Trúc Thị_Yến Bích_Ngọc Tuyết_Mai Thị_Nga Cẩm_Tú Thảo_Vy Thị_Cúc Xuân_Mai`),
    S: w(`Nguyễn Trần Lê Phạm Hoàng Huỳnh Phan Vũ Võ Đặng Bùi Đỗ Hồ Ngô Dương Lý Đinh Trịnh Đoàn Lương Mai Tô Cao Lâm Hà Thái Tạ Châu Quách Kiều`),
  },
  th: {
    label: '泰語', cat: 'Southeast Asia', order: 'given',
    M: w(`Somchai Somsak Prasert Anan Kittipong Surasak Thanakorn Chaiwat Pichai Wichai Sombat Narong Apichart Weerasak Tawan Nattapong Kasem Boonmee Sakchai Thawatchai Wirat Chatchai Preecha Sarawut Teerapong Pongsakorn Anurak Chakrit Manit Saran Krit`),
    F: w(`Somying Malee Siriporn Pranee Nittaya Supaporn Kanya Wanida Ratana Sunisa Pimchanok Arunee Jintana Kulap Napaporn Orathai Suda Watcharee Busaba Chanida Duangjai Laddawan Manee Narumon Patcharee Rujira Sudarat Thanida Uraiwan Yaowalak Anong`),
    S: w(`Saetang Srisai Wongsawat Chaiyasit Boonmee Rattanakorn Suksawat Thongchai Prasertsuk Kaewmanee Sirikul Phromma Jaidee Wongchai Sukhum Charoen Pattanasin Rungruang Thanakit Sombun Phetcharat Srisuk Kittisak Intharat Namwong Chantarasak Mahasan Promsuwan Siripong Laohaphan Pongpan`),
  },
  my: {
    label: '緬甸語（無姓氏）', cat: 'Southeast Asia', order: 'given', mode: 'syll',
    M: w(`Aung Kyaw Zaw Htet Min Thura Ye Naing Than Myo Soe Tun Hlaing Win Khin Kyi Phyo Zin Sithu Thein Maung Nyi Lin Htun Moe Pyae Tin Zayar Ko Hein`),
    F: w(`Khin Thin Aye Mya Nandar Su Hnin Ei Thandar Moe Cho Phyu Yadanar Swe Myat Wai Thazin San May Nilar Kay Khaing Zin Thida Hla Yin Mi Sandar Yamin Nu`),
    S: w(`Aung Kyaw Win Htun Zaw Naing Oo Lwin Myint Tun Soe Maung Thein Lin Hlaing Thet Min Than Htay Khaing Swe Tin Nyunt Shwe Mya Phyo San Hein Ko Yin`),
  },
  km: {
    label: '高棉語', cat: 'Southeast Asia', order: 'family', sep: ' ', maiden: true,
    M: w(`Sokha Dara Vannak Sovann Rithy Pich Sopheak Chea Narith Samnang Veasna Bunthoeun Visal Sambath Piseth Kosal Chanthou Vibol Sophal Sreng Rath Phalla Makara Vuthy Sary Channa Bora Heng Sothea Samrith`),
    F: w(`Sreymom Sophea Chantha Sokunthea Bopha Srey Kunthea Davy Maly Sreyneang Chenda Pheakdey Vanna Rachana Sothy Leakhena Phally Thida Sambo Kolap Sopheap Chanry Dany Rotha Nary Sreypov Sinath Sokly Chamroeun Mealea`),
    S: w(`Chea Sok Heng Kong Ly Khem Meas Pich Chhun Ouk Keo Lim Phan Sam Yim Chan Srey Touch Hun Mao Pen Ros Prak Nguon Hout Seng Chhay Thong Lay Vong`),
  },
  lo: {
    label: '寮語', cat: 'Southeast Asia', order: 'given',
    M: w(`Khamphone Somphone Bounthavy Sengdao Vilay Phetsamone Thongsavanh Souksavanh Bounmy Sisavath Khamla Anousone Vongsay Kongkeo Sivilay Phouthone Chanthavong Manivone Outhay Latsamy Keomany Thongchanh Santi Sisouk Phoumy Viengkham Bounlieng Somsack Kham`),
    F: w(`Vanida Souphaphone Chanthavy Phonesavanh Malaythong Bouakham Phengdy Sivone Vilayphone Dalavanh Mayoury Nalinh Viengxay Thip Bouasone Chanthone Khampheng Sengaloun Ketsana Oudone Manilay Khamkeo Anongsack Chansamone Soudavanh Noy Vanh Bounmee Sengmany Phetmany`),
    S: w(`Phommachanh Sayavong Souvannavong Keomanivong Vongsa Phanthavong Inthavong Xayasone Sisouphanh Chanthavisouk Luangkhot Phimmasone Thammavong Southichak Vongxay Bounnhang Douangmala Keophila Luangrath Manivong Phetsarath Siharath Sengdara Siphandone Chanthalangsy Phongsavan Rattanavong Soukhaseum Lattanavong Boupha`),
  },
  id: {
    label: '印尼語', cat: 'Southeast Asia', order: 'given', maiden: true, singleP: 0.35,
    M: w(`Budi Agus Andi Dedi Eko Rizki Fajar Hendra Joko Bayu Yusuf Ahmad Rudi Wahyu Dimas Hasan Irfan Slamet Teguh Bambang Arif Rahmat Iwan Surya Yoga Gilang Adi Heru Putra Reza Haris`),
    F: w(`Siti Dewi Sri Ratna Putri Ayu Wulan Rina Fitri Indah Lestari Nur Yuni Ani Tri Maya Rani Intan Dian Endang Sari Lia Mega Citra Nia Wati Eka Rahma Aisyah Kartika`),
    S: w(`Saputra Santoso Wijaya Hidayat Setiawan Kurniawan Pratama Nugroho Susanto Wibowo Lestari Hartono Gunawan Siregar Nasution Simanjuntak Harahap Purnomo Rahman Firmansyah Hakim Utama Permana Maulana Ramadhan Suryadi Kusuma Handayani Yulianto Halim Siahaan`),
  },
  ms: {
    label: '馬來語', cat: 'Southeast Asia', order: 'given', mode: 'patro', maiden: true, particle: { M: 'bin', F: 'binti' },
    M: w(`Ahmad Muhammad Ismail Ibrahim Abdullah Hassan Hussin Yusof Zulkifli Razak Azman Kamal Hafiz Faizal Azlan Rashid Shafie Hamzah Zainal Syafiq Aiman Haziq Danial Irfan Amirul Firdaus Hakim Farhan Zaki Nazri Khairul Rosli`),
    F: w(`Siti_Aminah Nur_Aisyah Nurul_Huda Nor_Azizah Fatimah Aminah Zainab Rohani Salmah Norhayati Hasnah Faridah Mariam Sharifah Azizah Nadia Aina Balqis Husna Sofea Farah Liyana Syafiqah Atiqah Nabilah Izzati Amira Wani Rosnah Siti_Hajar`),
    S: w(`Ahmad Muhammad Ismail Ibrahim Abdullah Hassan Hussin Yusof Zulkifli Razak Azman Kamal Hafiz Faizal Azlan Rashid Shafie Hamzah Zainal Syafiq Aiman Haziq Danial Irfan Amirul Firdaus Hakim Farhan Zaki Nazri Khairul Rosli`),
  },
  fil: {
    label: '菲律賓語', cat: 'Southeast Asia', order: 'given',
    M: w(`Juan Jose Mark Jerome Angelo Rafael Miguel Paolo Carlo Joel Ramon Ricardo Eduardo Noel Dennis Arnel Reynaldo Rodel Jun Bong Jayson Kevin Christian Nathaniel Gabriel Manuel Danilo Ernesto Felipe Rolando Benjamin`),
    F: w(`Maria Ana Rosario Corazon Teresita Luzviminda Jasmine Angelica Michelle Joanna Grace Mary_Jane Cristina Liza Nenita Marites Rowena Juanita Lourdes Imelda Carmela Bea Shiela Kristine Maricel Jennifer Arlene Divina Gina Aileen Princess`),
    S: w(`Santos Reyes Cruz Bautista Ocampo Garcia Mendoza Torres Tomas Andrada Castillo Flores Villanueva Ramos Aquino Dela_Cruz Gonzales Rivera Navarro Domingo Pascual Salazar Manalo Aguilar Soriano Mercado Lopez Hernandez Perez Fernandez`),
  },
  hi: {
    label: '印地語（北印度）', cat: 'South Asia', order: 'given',
    M: w(`Rahul Amit Raj Vikram Sanjay Arjun Rohan Anil Suresh Ravi Manoj Deepak Ramesh Vijay Pradeep Sunil Ajay Naveen Prakash Mohan Ashok Sachin Nitin Dinesh Rajesh Mukesh Pankaj Ankit Vivek Gaurav Abhishek Shivam`),
    F: w(`Priya Anita Sunita Kavita Meena Pooja Neha Divya Anjali Sita Radha Geeta Sneha Aarti Rekha Swati Savitri Kamla Jyoti Manju Nisha Shreya Asha Poonam Sarita Rani Sushma Seema Ritu Kiran Anamika`),
    S: w(`Sharma Singh Kumar Gupta Verma Yadav Mishra Pandey Tiwari Chauhan Joshi Agarwal Srivastava Dubey Saxena Thakur Rajput Jha Shukla Rawat Bansal Mehta Kapoor Chopra Jain Bhatt Tripathi Rathore Maurya Prasad Kushwaha`),
  },
  bn_hi: {
    label: '孟加拉語（印度西孟加拉）', cat: 'South Asia', order: 'given',
    M: w(`Sourav Subhas Abhijit Debashis Arindam Sandip Partha Tapan Biswajit Soumen Anirban Prosenjit Rajib Subrata Dipankar Pradip Sudip Ratan Amitava Santanu Kaushik Indranil Tanmoy Joydeep Swapan Gautam Ashim Dibyendu Rana Subir`),
    F: w(`Sumitra Anindita Mousumi Shreya Moumita Sutapa Rina Madhumita Piyali Debjani Swati Tanushree Ipsita Mala Sharmistha Rupa Chandana Srabani Aparna Nandini Joyeeta Sagarika Purnima Bithika Kakoli Mitali Rumki Sohini Tapasi Bidisha`),
    S: w(`Chatterjee Banerjee Mukherjee Ghosh Bose Das Dutta Sen Roy Chakraborty Bhattacharya Mitra Sarkar Saha Basu Guha Dey Majumdar Pal Biswas Mondal Halder Ganguly Sengupta Chowdhury Ray Nandi Lahiri Bagchi Kundu`),
  },
  bn: {
    label: '孟加拉語（孟加拉國）', cat: 'South Asia', order: 'given',
    M: w(`Mohammad Abdul Rahim Karim Jahangir Shamim Rafiq Anwar Kamal Habib Monir Sohel Farhad Mizanur Tanvir Rubel Shahin Masud Nasir Habibur Sumon Mamun Jewel Arif Rony Hasan Alamgir Biplob Sagor Shuvo Tareq`),
    F: w(`Fatema Rahima Salma Nasrin Shirin Rokeya Jannat Morjina Sultana Ferdousi Taslima Shahnaz Rina Parveen Halima Rehana Mitu Sharmin Nusrat Lovely Popy Ruma Shapla Laila Moushumi Anika Tania Sumaiya Jharna Runa`),
    S: w(`Islam Rahman Hossain Ahmed Khan Chowdhury Uddin Miah Sarker Talukder Siddique Akter Begum Mondal Bhuiyan Sheikh Alam Biswas Haque Mollah Karim Ali Mia Howlader Akand Majumdar Patwary Khondaker Pramanik Hasan Mridha Kazi Bepari Sikder`),
  },
  ta: {
    label: '泰米爾語', cat: 'South Asia', order: 'given', mode: 'patro',
    M: w(`Murugan Rajan Selvam Kumar Ramesh Suresh Senthil Karthik Arun Vijay Prakash Ganesh Mani Saravanan Balaji Anbu Kannan Raja Venkatesh Siva Pandian Mohan Ravi Dinesh Palani Velu Arumugam Sundar Ilango Ramasamy`),
    F: w(`Lakshmi Meena Kavitha Priya Devi Selvi Valli Thenmozhi Malathi Revathi Uma Radha Vani Janaki Kalaiselvi Mythili Anitha Saranya Nithya Gomathi Parvathi Sangeetha Vasanthi Pushpa Rani Amudha Tamilselvi Kamala Sudha Indira`),
    S: w(`Murugan Rajan Selvam Kumar Ramesh Suresh Senthil Karthik Arun Vijay Prakash Ganesh Mani Saravanan Balaji Anbu Kannan Raja Venkatesh Siva Pandian Mohan Ravi Dinesh Palani Velu Arumugam Sundar Ilango Ramasamy`),
  },
  te: {
    label: '泰盧固語', cat: 'South Asia', order: 'given',
    M: w(`Venkat Srinivas Ramesh Suresh Ravi Krishna Naresh Mahesh Prasad Kiran Anil Sai Raju Chandra Harish Satish Srikanth Nagarjuna Pavan Rajesh Mohan Vamsi Ashok Bhaskar Murali Naveen Ganesh Praveen Sudhakar`),
    F: w(`Lakshmi Padma Sri Swathi Anusha Divya Haritha Sirisha Bhavani Kavitha Sravani Madhavi Jyothi Sunitha Rajeswari Vijaya Radhika Deepthi Prasanna Sandhya Mounika Pavani Aruna Rani Sowmya Savitri Vasantha Rama Manasa`),
    S: w(`Reddy Naidu Rao Chowdary Raju Varma Sastry Goud Yadav Prasad Murthy Babu Kumar Rajulu Setty Gupta Pillai Naik Chary Sharma Vemula Kondapalli Nandamuri Penumatsa Gollapudi Bandaru Chinta Tummala Alluri Dasari`),
  },
  mr: {
    label: '馬拉地語', cat: 'South Asia', order: 'given',
    M: w(`Sachin Rahul Amol Sandeep Prashant Nitin Vijay Santosh Ganesh Rajesh Sunil Vishal Mangesh Prakash Shivaji Sagar Swapnil Omkar Yogesh Pravin Ashish Dnyaneshwar Abhijit Mahesh Tushar Nilesh Ajinkya Rohit Chetan Vaibhav`),
    F: w(`Sunita Shweta Rutuja Pooja Kalyani Madhuri Smita Manisha Archana Vaishali Sarika Swati Jyoti Rupali Aarti Pallavi Sneha Priyanka Vidya Anjali Shubhangi Mugdha Sayali Aishwarya Gauri Namrata Savita Kavita Trupti`),
    S: w(`Patil Deshmukh Kulkarni Jadhav Pawar Shinde More Gaikwad Joshi Chavan Kadam Bhosale Deshpande Sawant Naik Thorat Salunkhe Kale Mane Gokhale Phadke Apte Joglekar Bhide Ranade Wagh Kamble Shelke Thakre Pansare`),
  },
  gu: {
    label: '古吉拉特語', cat: 'South Asia', order: 'given',
    M: w(`Hardik Jignesh Mehul Nilesh Kalpesh Dhaval Bhavesh Jayesh Chirag Paresh Ketan Hitesh Mitesh Darshan Kunal Ashish Rakesh Yash Parth Jaydeep Vipul Tejas Manish Haresh Rajendra Dipak Pranav Nirav Alpesh Mayur Sagar`),
    F: w(`Hetal Pinal Bhavna Jyoti Dipti Nayna Kinjal Falguni Rupal Hina Komal Nisha Pooja Krupa Mital Sejal Dhara Vaishali Hiral Arpita Foram Bhumi Ami Trusha Mansi Heena Purvi Khushbu Rinku Janki`),
    S: w(`Patel Shah Mehta Desai Joshi Parekh Modi Trivedi Gandhi Thakkar Pandya Vyas Bhatt Amin Dave Chauhan Solanki Rathod Parmar Chaudhary Jani Kapadia Sheth Mistry Soni Vora Panchal Dalal Raval Zaveri`),
  },
  kn: {
    label: '坎那達語', cat: 'South Asia', order: 'given',
    M: w(`Raghavendra Manjunath Suresh Ramesh Mahesh Naveen Prakash Kiran Srinivas Girish Basavaraj Shivakumar Anand Ravi Harish Vinay Sathish Chandrashekar Nagaraj Venkatesh Umesh Prashanth Siddaraju Lokesh Mohan Darshan Yogesh Shashi Puneeth Kumar`),
    F: w(`Lakshmi Savitha Kavitha Shobha Suma Roopa Vani Latha Deepa Geetha Manjula Rekha Asha Nirmala Pushpa Shruthi Sowmya Chaitra Bhavya Meghana Pooja Rashmi Usha Veena Anitha Sudha Shylaja Rathna Prema`),
    S: w(`Gowda Shetty Hegde Bhat Naik Rao Patil Kulkarni Reddy Murthy Acharya Nayak Kamath Pai Shenoy Prabhu Poojary Hebbar Swamy Urs Biradar Angadi Havanur Madiwal Hiremath Kamble Devadiga Salian Hosamani`),
  },
  ml: {
    label: '馬拉雅拉姆語', cat: 'South Asia', order: 'given',
    M: w(`Anil Biju Sajeev Shibu Rajesh Sunil Manoj Jose Thomas Joby Binu Rajan Suresh Santhosh Vinod Anoop Jithin Arun Sreejith Vineeth Prasad Unnikrishnan Ajith Sabu Saji Baby Shaji Mathew Basil Jijo Nikhil Faisal Shafeeq`),
    F: w(`Lakshmi Remya Anitha Sindhu Deepa Sreeja Maya Rekha Beena Molly Sheeba Jancy Priya Divya Resmi Shiny Bindu Sumi Asha Nisha Fathima Rasheeda Jessy Elsy Anju Smitha Gayathri Aswathy Athira`),
    S: w(`Nair Menon Pillai Kurup Panicker Namboothiri Varma Warrier Kaimal Nambiar Thomas Mathew Joseph Philip George Varghese Kuriakose Abraham Jacob Antony Fernandez Mohammed Koya Kutty Marakkar Thangal Iyer Kumar Thekkedath`),
  },
  pa: {
    label: '旁遮普語（錫克）', cat: 'South Asia', order: 'given', mid: { M: 'Singh', F: 'Kaur' },
    M: w(`Harpreet Gurpreet Manpreet Jaspreet Sukhdeep Gurdeep Balwinder Jaswinder Amarjeet Kulwinder Harjinder Gurmeet Navdeep Parminder Rajinder Satnam Jagdeep Surinder Davinder Baljit Gurinder Lakhwinder Mandeep Simranjeet Taranjit Karamjit Hardeep Inderjit Amandeep`),
    F: w(`Harpreet Gurpreet Manpreet Jaspreet Simran Navneet Amandeep Kuldeep Rajwinder Paramjit Baljeet Sukhwinder Harleen Gagan Jasleen Rupinder Mandeep Kiran Amarjit Daljit Ravneet Sarabjit Jasmeet Parminder Gurleen Lovepreet Tarandeep Sandeep Rajvir Mehak`),
    S: w(`Gill Sandhu Sidhu Dhillon Grewal Brar Randhawa Bajwa Virk Cheema Sekhon Mann Johal Bhullar Aulakh Sahota Toor Gosal Dhaliwal Hundal Walia Chahal Bains Atwal Kang Purewal Deol Bedi Ahluwalia Sodhi`),
  },
  ur: {
    label: '烏爾都語／旁遮普語', cat: 'South Asia', order: 'given',
    M: w(`Muhammad Ali Ahmed Hassan Usman Bilal Imran Faisal Kamran Tariq Zahid Asif Naveed Shahid Rashid Salman Irfan Farhan Hamza Junaid Waqas Adnan Saeed Nadeem Yasir Zubair Khalid Rizwan Abdul Omar`),
    F: w(`Ayesha Fatima Zainab Maryam Sana Hina Bushra Amna Nadia Saima Rukhsana Shazia Farida Noreen Samina Khadija Sadia Nazia Rabia Mehwish Iqra Uzma Humaira Tahira Shabana Asma Sobia Lubna Naila Rubina`),
    S: w(`Khan Ahmed Malik Hussain Sheikh Butt Raza Chaudhry Qureshi Siddiqui Mirza Baig Ansari Abbasi Awan Bhatti Gill Javed Shah Rehman Iqbal Mahmood Akhtar Farooqi Niazi Zaidi Rana Memon Baloch Yousafzai`),
  },
  ps_dari: {
    label: '普什圖語／達利語', cat: 'South Asia', order: 'given',
    M: w(`Mohammad Ahmad Hamid Karim Rahim Zahir Nasir Farid Sayed Jawid Rahmat Wali Qais Bashir Hashmat Noor Ghulam Fazal Najib Aziz Mirwais Asadullah Habib Shir Sultan Hedayat Ajmal Samiullah Mujeeb Waheed`),
    F: w(`Fatima Zahra Mariam Shukria Nazia Gul Laila Palwasha Khadija Masooma Sahar Farida Mahbooba Humaira Najiba Zarghona Parwin Rahima Shaima Hasina Nilofar Sima Marjan Shabnam Soraya Basira Hila Nasrin Aziza Zeba`),
    S: w(`Ahmadzai Karzai Popalzai Yousafzai Barakzai Noorzai Mohmand Safi Wardak Sadat Hotak Durrani Stanikzai Habibi Rahimi Rahmani Ahmadi Hashimi Sultani Qaderi Amini Nazari Mohammadi Rezai Faizi Sharifi Azizi Wafa Popal Mangal Zazai Kakar Tokhi Hakimi`),
  },
  ne: {
    label: '尼泊爾語', cat: 'South Asia', order: 'given',
    M: w(`Ram Shyam Hari Krishna Bishnu Rajesh Sujan Prakash Dipak Bikash Santosh Sanjay Binod Ramesh Suresh Anil Nabin Kiran Bijay Sunil Gopal Rajan Niraj Roshan Suman Pawan Dinesh Bibek Sagar Prabin`),
    F: w(`Sita Gita Sarita Sunita Laxmi Sabina Anita Kamala Rama Mina Radha Parbati Durga Maya Bimala Sapana Sushila Rekha Binita Kabita Shanti Manju Puja Nirmala Samjhana Anju Ranjana Sangita Srijana Yasoda`),
    S: w(`Sharma Adhikari Khatri Thapa Gurung Tamang Rai Limbu Shrestha Magar Karki Basnet Bhandari Poudel Koirala Pandey Neupane Regmi Dahal Bhattarai Acharya Joshi Subedi Ghimire Khadka Bista Chaudhary Maharjan Lama Sherpa`),
  },
  si: {
    label: '僧伽羅語', cat: 'South Asia', order: 'given',
    M: w(`Nuwan Chaminda Kasun Sampath Lasantha Ruwan Dinesh Pradeep Tharindu Asanka Janaka Mahesh Saman Thilina Roshan Chathura Buddhika Nimal Sunil Kamal Anura Ranjith Upul Prasanna Isuru Dilshan Lahiru Hasitha Gayan Ajith Charith`),
    F: w(`Nilmini Kumari Sandya Chamari Dilani Nadeeka Samanthi Anoma Sunethra Priyanka Malkanthi Shiromi Iresha Gayani Hasini Thilini Manel Sirima Kusum Lakmali Nirmala Dulani Sachini Ishara Rasika Piyumi Sanduni Menaka Amali Chathuri`),
    S: w(`Perera Fernando Silva De_Silva Jayasinghe Wickramasinghe Gunawardena Bandara Rajapaksa Weerasinghe Herath Karunaratne Dissanayake Senanayake Ratnayake Samarasinghe Amarasinghe Kumara Liyanage Ranasinghe Pathirana Jayawardena Abeysekera Gamage Wijesinghe Rathnayake Seneviratne Mendis Peiris Fonseka Madushanka`),
  },
  dv: {
    label: '迪維希語（馬爾地夫）', cat: 'South Asia', order: 'given',
    M: w(`Ahmed Mohamed Ibrahim Hassan Ali Abdulla Hussain Ismail Yoosuf Naseem Shiham Rasheed Waheed Moosa Adam Latheef Zahir Shareef Imran Nazim Fayaz Ilyas Niyaz Azim Rilwan Aslam Mauroof Shifaz Yameen Mahir`),
    F: w(`Aishath Fathimath Mariyam Khadheeja Hawwa Aminath Shaheeda Zeenath Nazima Raihana Rishtha Shifa Hana Aniya Leesha Maaha Nuzha Sana Shaznee Zuha Areesha Eesha Ruqiyya Shiuna Ibtisam Nisha Dhiyana Mohamed_Nasra Wafa Fazna`),
    S: w(`Didi Manik Kaleyfaanu Fulhu Thakurufaanu Moosa Naseer Rasheed Latheef Saeed Waheed Shareef Zahir Adam Mohamed Ahmed Abdulla Hussain Shakir Dhoshimeyna Maniku Rilwan Imad Nasheed Jameel Solih Aslam Hameed Ibrahim Hassan Ali`),
  },
  dz: {
    label: '不丹語（無姓氏）', cat: 'South Asia', order: 'given', mode: 'syll',
    M: w(`Tshering Karma Sonam Pema Dorji Jigme Kinley Ugyen Tenzin Sangay Namgay Dawa Phuntsho Singye Lhendup Rinchen Passang Tashi Thinley Norbu Chimi Kuenga Tandin Yeshey Gyeltshen Jamyang Dendup Rigzin`),
    F: w(`Dechen Choden Yangchen Pema Tshering Sonam Kinzang Lhamo Zangmo Dolma Wangmo Yeshey Chimi Ugyen Tashi Sangay Karma Deki Pelden Kunzang Lhaki Phuntsho Thinley Rinzin Yangzom Bumpa Tenzin Choki Dorji`),
    S: w(`Dorji Wangchuk Tshering Penjor Namgyel Gyeltshen Jamtsho Tobgay Phuntsho Norbu Tenzin Rinchen Zangpo Pelzang Samdrup Wangdi Thinley Yoezer Lhendup Choki Dawa Sherab Rabten Khandu Gyaltshen Dendup Tashi Namgay Sangay`),
  },
  kk_ky: {
    label: '哈薩克語／吉爾吉斯語', cat: 'Central Asia', order: 'given', forms: true,
    M: w(`Nurlan Daniyar Aibek Timur Bekzat Ruslan Azamat Erlan Askar Marat Kanat Baurzhan Samat Berik Kairat Yerbolat Dauren Arman Nursultan Almas Talgat Serik Baktybek Ulan Bakyt Adilet Emil Azat Tilek Nurbek`),
    F: w(`Aigerim Dana Madina Aliya Gulnara Zarina Saule Zhanna Aida Assel Kamila Gulmira Altynai Meruert Bibigul Zhanar Aizada Nurgul Dinara Ainur Aruzhan Zere Karlygash Symbat Cholpon Aidai Nazira Kanykei Elmira Begimai`),
    S: w(`Nurmukhamedov|Nurmukhamedova Zhakupov|Zhakupova Beisenov|Beisenova Omarov|Omarova Satybaldiev|Satybaldieva Kasymov|Kasymova Dzhumabaev|Dzhumabaeva Bekov|Bekova Toktarov|Toktarova Orazov|Orazova Mukhametov|Mukhametova Abdrakhmanov|Abdrakhmanova Sarsenbaev|Sarsenbaeva Akhmetov|Akhmetova Tursunov|Tursunova Kuanyshev|Kuanysheva Isaev|Isaeva Ibraimov|Ibraimova Sadykov|Sadykova Mamytov|Mamytova Kurmanov|Kurmanova Zhunusov|Zhunusova Nurgaliev|Nurgalieva Alimbekov|Alimbekova Sultanov|Sultanova Temirov|Temirova`),
  },
  uz_tk: {
    label: '烏茲別克語／土庫曼語', cat: 'Central Asia', order: 'given', forms: true,
    M: w(`Rustam Farhod Jasur Sardor Bobur Dilshod Ulugbek Otabek Anvar Zafar Nodir Shavkat Murod Akmal Sherzod Azizbek Javlon Bekzod Doston Elyor Jahongir Komil Mansur Odil Sanjar Timur Umid Abror Behruz Ravshan`),
    F: w(`Dilnoza Malika Nargiza Feruza Shahnoza Nilufar Sevara Lola Mohira Munira Guzal Zamira Gulnora Madina Mukhlisa Dildora Barno Zulfiya Sabina Nigora Shahlo Kamola Iroda Gulchehra Laylo Sitora Aziza Muazzam Zarnigor Yulduz`),
    S: w(`Karimov|Karimova Rakhimov|Rakhimova Aliyev|Aliyeva Ismailov|Ismailova Abdullaev|Abdullaeva Yusupov|Yusupova Saidov|Saidova Ahmedov|Ahmedova Kurbanov|Kurbanova Nazarov|Nazarova Mirzaev|Mirzaeva Hasanov|Hasanova Usmonov|Usmonova Berdiev|Berdieva Ergashev|Ergasheva Tursunov|Tursunova Sultanov|Sultanova Umarov|Umarova Rashidov|Rashidova Jurayev|Jurayeva Kadyrov|Kadyrova Khamidov|Khamidova Normatov|Normatova Sharipov|Sharipova Mamatov|Mamatova Ibragimov|Ibragimova Murodov|Murodova`),
  },
  tg: {
    label: '塔吉克語', cat: 'Central Asia', order: 'given', forms: true,
    M: w(`Rustam Sherali Farrukh Firdavs Nasim Jamshed Shamsiddin Bakhtiyor Davlat Rahim Mirzo Ismoil Sodiq Umar Hasan Husen Aziz Saidali Muhammadi Parviz Nozim Sohib Abdurahim Kurbon Salim Amir Zafar Abubakr Nurullo Bakhrom`),
    F: w(`Nilufar Zarina Mavjuda Gulnora Parvina Farzona Nigina Shahnoza Dilorom Mehrangez Zebo Gulchehra Muhabbat Sabohat Manizha Malika Farangis Ruhshona Nodira Sitora Tahmina Zulfiya Dilbar Muniza Sharifa Mahbuba Maftuna Gulbahor Shirin Madina`),
    S: w(`Rahmonov|Rahmonova Nazarov|Nazarova Saidov|Saidova Ismoilov|Ismoilova Sharifov|Sharifova Rahimov|Rahimova Qodirov|Qodirova Mirzoev|Mirzoeva Davlatov|Davlatova Hakimov|Hakimova Safarov|Safarova Ashurov|Ashurova Kurbonov|Kurbonova Sodiqov|Sodiqova Boboev|Boboeva Yusufov|Yusufova Odinaev|Odinaeva Muhidinov|Muhidinova Nabiev|Nabieva Zokirov|Zokirova Olimov|Olimova Gafurov|Gafurova Jalilov|Jalilova Umarov|Umarova Sattorov|Sattorova Habibov|Habibova Rajabov|Rajabova Shokirov|Shokirova`),
  },
  az: {
    label: '亞塞拜然語', cat: 'Caucasus', order: 'given', forms: true,
    M: w(`Elchin Rashad Farid Vugar Orkhan Tural Elnur Kamran Samir Nijat Ilham Anar Rufat Eldar Emin Vusal Murad Ramil Javid Zaur Ruslan Taleh Ayaz Natig Famil Fuad Huseyn Tahir Aydin Nazim`),
    F: w(`Leyla Aysel Gunel Nigar Sevinj Aynur Zulfiya Konul Aytan Narmin Gulnar Nurana Khadija Sabina Samira Sevda Fidan Ulviyya Aysu Lala Arzu Mehriban Tarana Ilaha Shahla Rena Aygun Esmira Afag Gulshan`),
    S: w(`Aliyev|Aliyeva Mammadov|Mammadova Huseynov|Huseynova Hasanov|Hasanova Guliyev|Guliyeva Ismayilov|Ismayilova Abbasov|Abbasova Rzayev|Rzayeva Mustafayev|Mustafayeva Ibrahimov|Ibrahimova Aslanov|Aslanova Sadigov|Sadigova Karimov|Karimova Bayramov|Bayramova Jafarov|Jafarova Safarov|Safarova Nasibov|Nasibova Heydarov|Heydarova Qasimov|Qasimova Valiyev|Valiyeva Asgarov|Asgarova Rahimov|Rahimova Mirzayev|Mirzayeva Orujov|Orujova Agayev|Agayeva Rustamov|Rustamova Shirinov|Shirinova Najafov|Najafova`),
  },
  ka: {
    label: '喬治亞語', cat: 'Caucasus', order: 'given',
    M: w(`Giorgi Davit Levan Nika Irakli Zurab Tornike Lasha Mamuka Gela Tengiz Vakhtang Shota Otar Badri Merab Beka Luka Saba Temur Guram Akaki Revaz Avtandil Gocha Zaza Tamaz Koba Vano Besik`),
    F: w(`Nino Mariam Ana Tamar Salome Natia Ketevan Nana Eka Lali Maia Tea Elene Ketino Manana Marika Mzia Medea Rusudan Lela Sopo Tako Irma Dali Nutsa Khatuna Lika Mariami Tinatin Lia`),
    S: w(`Beridze Kapanadze Gelashvili Maisuradze Lomidze Giorgadze Chkheidze Kvaratskhelia Tsiklauri Janelidze Abashidze Bagrationi Gogiashvili Khachidze Lordkipanidze Mdivani Gvaramia Kiknadze Shengelia Gamsakhurdia Jorjadze Tabatadze Mchedlishvili Kobakhidze Dolidze Kutateladze Zhvania Javakhishvili Ananiashvili Sikharulidze Tsereteli`),
  },
  hy: {
    label: '亞美尼亞語', cat: 'Caucasus', order: 'given',
    M: w(`Aram Armen Artur Gor Hayk Narek Vahe Karen Tigran Samvel Levon Garik Hovhannes Arman Ashot Sargis Vardan Gevorg Mher Davit Arsen Suren Edgar Rafayel Hrant Vazgen Artak Gagik Norayr Ruben Vahagn`),
    F: w(`Anahit Lusine Narine Mane Hasmik Satenik Armine Gayane Lilit Siranush Astghik Anush Tatev Nare Zaruhi Meline Mariam Karine Seda Nvard Sona Susanna Ruzanna Hripsime Arpine Naira Shushan Tamara Gohar Marine Ani`),
    S: w(`Petrosyan Hovhannisyan Grigoryan Sargsyan Harutyunyan Gevorgyan Danielyan Avetisyan Hakobyan Mkrtchyan Vardanyan Stepanyan Manukyan Karapetyan Khachatryan Ghazaryan Martirosyan Poghosyan Galstyan Sahakyan Margaryan Mnatsakanyan Arakelyan Baghdasaryan Simonyan Davtyan Mirzoyan Asatryan Ohanyan Melkonyan`),
  },
  ar_gulf: {
    label: '阿拉伯語（海灣）', cat: 'Middle East', order: 'given', maiden: true,
    M: w(`Mohammed Abdullah Khalid Faisal Sultan Fahad Salman Turki Nasser Saud Majid Rashid Hamad Saeed Ahmed Ali Hassan Yousef Abdulaziz Bandar Nawaf Mishal Talal Saif Hamdan Mansour Obaid Jaber Badr Ibrahim Omar`),
    F: w(`Fatima Noura Maryam Aisha Sara Hessa Moza Latifa Shamma Mariam Reem Lulwa Hind Dana Layla Haya Amna Sheikha Maha Jawaher Munira Alanoud Dalal Nouf Wafa Ghada Abeer Hanan Salma Maitha`),
    S: w(`Al-Otaibi Al-Harbi Al-Qahtani Al-Ghamdi Al-Dosari Al-Shammari Al-Zahrani Al-Mutairi Al-Subaie Al-Maktoum Al-Nahyan Al-Thani Al-Sabah Al-Khalifa Al-Said Al-Balushi Al-Hashimi Al-Mazrouei Al-Kaabi Al-Marri Al-Kuwari Al-Ajmi Al-Enezi Al-Rashidi Al-Zaabi Al-Suwaidi Al-Hajri Al-Naimi Al-Busaidi Al-Sanani`),
  },
  ar_levant: {
    label: '阿拉伯語（黎凡特）', cat: 'Middle East', order: 'given', maiden: true,
    M: w(`Mohammad Ahmad Khaled Omar Ali Hassan Hussein Mahmoud Ibrahim Yousef Tariq Samer Fadi Rami Ziad Walid Bassam Nabil Jihad Hani Majed Adnan Karim Amer Wael Ghassan Anas Rafiq Elias Georges Jad`),
    F: w(`Fatima Layla Nour Rania Dina Lina Hala Reem Maya Yasmin Samar Rima Salma Mariam Zeina Nadine Lama Dalia Hiba Ghada Rasha Sawsan Noura Joumana Carla Nadia Suha Hanan Randa Mona`),
    S: w(`Haddad Khoury Nasser Khalil Mansour Saleh Najjar Darwish Hamdan Suleiman Hijazi Shami Daher Barakat Masri Jaber Qassem Tawil Hourani Sabbagh Kassab Atrash Bitar Issa Farah Sarraf Aoun Rizk Habib Zureik Hussein`),
  },
  ar_maghreb: {
    label: '阿拉伯語（馬格里布）', cat: 'Middle East', order: 'given', maiden: true,
    M: w(`Mohamed Ahmed Youssef Karim Rachid Hicham Said Mustapha Abdelkader Omar Hamza Amine Yassine Mehdi Nabil Redouane Samir Walid Brahim Khalid Ismail Tarek Hakim Farid Slimane Anis Bilal Zakaria Nacer Lotfi`),
    F: w(`Fatima Khadija Aicha Amina Samira Nadia Salma Zineb Meryem Imane Hind Soukaina Houda Sanaa Latifa Ines Leila Yasmine Asma Rim Wafa Nour Chaimae Hajar Kenza Lamia Sihem Amel Malika Djamila`),
    S: w(`Benali Bennani Alaoui Idrissi Tazi Fassi Berrada Lahlou Chraibi Amrani Mansouri Belkacem Boudiaf Saidi Zerrouki Haddad Trabelsi Ben_Salah Jebali Bouazizi Mahjoub Cherif Brahimi Khelifi Mokhtari Bouzid Sebti Ouali Kaddour Hamdi`),
  },
  ar_nile: {
    label: '阿拉伯語（埃及、蘇丹）', cat: 'Middle East', order: 'given', maiden: true,
    M: w(`Mohamed Ahmed Mahmoud Mostafa Ibrahim Ali Hassan Hossam Tarek Amr Khaled Karim Sherif Ayman Hany Wael Ashraf Magdy Yasser Essam Ramy Osama Sayed Adel Abdelrahman Omar Youssef Hesham Gamal Ismail Osman`),
    F: w(`Fatma Aya Mona Nour Salma Heba Dina Rania Hanan Nermine Shaimaa Amal Samar Eman Sara Yasmin Hoda Mervat Doaa Marwa Nagwa Zeinab Reem Aliaa Rasha Mai Alaa Esraa Safaa Huda`),
    S: w(`Hassan Mohamed Ibrahim Abdelrahman Saleh Mahmoud Farouk Gaber Mansour Nasr Salem Soliman Ismail Fouad Shehata Badawi Zaki Hegazy Abdelaziz Metwally Khalil Awad Eissa Morsi Sayed Osman Babiker Abdalla Elhassan Khalifa Eltayeb Idris`),
  },
  fa: {
    label: '波斯語', cat: 'Middle East', order: 'given', maiden: true,
    M: w(`Mohammad Ali Reza Hossein Mehdi Amir Hamid Saeed Majid Kaveh Arash Babak Farhad Behnam Payam Navid Siavash Dariush Kourosh Mostafa Ehsan Omid Pouya Shahram Masoud Parviz Iman Farid Sina Ramin`),
    F: w(`Fatemeh Zahra Maryam Narges Leila Shirin Parisa Mina Roya Sara Samira Neda Azadeh Nasrin Mahsa Elham Golnaz Shadi Sepideh Niloufar Forough Taraneh Yasaman Atefeh Maedeh Mojgan Pegah Setareh Hengameh Sima`),
    S: w(`Hosseini Mohammadi Ahmadi Rezaei Karimi Moradi Jafari Hashemi Rahimi Mousavi Sadeghi Ghorbani Abbasi Najafi Kazemi Ebrahimi Yazdani Tehrani Shirazi Esfahani Tabrizi Farahani Soltani Mahdavi Bagheri Nouri Zand Pahlavan Khosravi Amini`),
  },
  tr: {
    label: '土耳其語', cat: 'Middle East', order: 'given',
    M: w(`Mehmet Mustafa Ahmet Ali Hasan Hüseyin Emre Burak Murat Can Cem Kemal Okan Serkan Volkan Onur Tolga Yusuf Ömer Kaan Barış Eren Deniz Selim Orhan Ismail Fatih Ercan Umut Berk`),
    F: w(`Ayşe Fatma Emine Zeynep Elif Hatice Merve Esra Selin Derya Gül Sevgi Yasemin Büşra Ebru Cansu Ceren Pınar Sibel Burcu Nur Gamze Leyla Aylin Dilek Hülya Songül Tuba Nilay Melek`),
    S: w(`Yılmaz Kaya Demir Şahin Çelik Yıldız Yıldırım Öztürk Aydın Özdemir Arslan Doğan Kılıç Aslan Çetin Kara Koç Kurt Özkan Şimşek Polat Korkmaz Erdoğan Güneş Aksoy Tekin Avcı Türk Bulut Acar`),
  },
  he: {
    label: '希伯來語', cat: 'Middle East', order: 'given',
    M: w(`David Daniel Yossi Moshe Avi Itai Noam Eitan Omer Yonatan Amir Gal Ori Tomer Nir Shlomo Eli Uri Ariel Ran Lior Yaron Doron Oren Rotem Shai Guy Asaf Ido Elad`),
    F: w(`Noa Maya Tamar Shira Yael Michal Rachel Sarah Talia Dana Orly Hila Adi Liat Roni Naama Merav Keren Efrat Ayelet Tali Sivan Inbal Galit Lihi Rina Einat Yarden Moran Vered`),
    S: w(`Cohen Levi Mizrahi Peretz Biton Dahan Avraham Friedman Katz Azoulay Shapira Goldberg Malka Amar Ben-David Segal Barak Golan Ohana Stern Rosen Weiss Haim Klein Sasson Bar Shalom Gabay Nahum Peled`),
  },
  ku: {
    label: '庫德語', cat: 'Middle East', order: 'given',
    M: w(`Azad Rojhat Baran Dilshad Bahoz Serhat Rizgar Kawa Hogir Sherko Aram Ciwan Dara Rebwar Xebat Welat Zana Hawre Karwan Dlovan Shvan Awat Peshawa Barzan Kamaran Nawzad Sirwan Ako Hiwa Rawand`),
    F: w(`Rojda Zelal Berfin Dilan Avesta Shilan Hevi Jiyan Rozhin Narin Bahar Havin Sozdar Pakize Nazdar Hawar Lava Shler Rewshen Gulan Baxan Berivan Evin Kani Nishtiman Ronak Shirin Lana Sima Zilan Awin`),
    S: w(`Barzani Talabani Berwari Zebari Sindi Hawrami Baban Soran Jaf Kurdi Hamawand Dizayee Mukriyani Ardalan Zangana Jalali Barzinji Shakaki Hakkari Botani Mardini Bedirkhan Mirani Gorani Piran Khanaqini Rojbayani Kalhor Sorani Bradost Rewandizi`),
  },
  sw: {
    label: '斯瓦希里語（坦尚尼亞）', cat: 'Africa', order: 'given',
    M: w(`Juma Hamisi Baraka Emmanuel Joseph Daniel Peter Samuel Moses Godfrey Elias Said Salim Rashidi Omari Abdallah Bakari Athumani Mussa Frank Mathias Isaya Revocatus Deogratius Fadhili Kassim Jumanne Hassani Mohamedi Erasto`),
    F: w(`Amina Mary Grace Neema Zawadi Asha Halima Rehema Fatuma Mwajuma Zainabu Rose Happiness Furaha Upendo Agnes Mwanaisha Salma Esther Rukia Bahati Tatu Witness Pendo Eliza Veronica Janeth Devotha Anna`),
    S: w(`Mushi Massawe Mwakyusa Kimaro Mrema Mwinyi Hamisi Msuya Mwakalebela Kileo Shirima Lyimo Swai Mollel Mtui Kessy Mallya Minja Temba Ngowi Sanga Kombo Mbwambo Mkapa Nyerere Kikwete Magufuli Mwamba Bakari Kapinga Makame`),
  },
  ke: {
    label: '肯亞（吉庫尤、盧奧等）', cat: 'Africa', order: 'given',
    M: w(`James John Peter Samuel Joseph David Daniel Moses Kevin Brian Dennis Collins Otieno Kamau Ochieng Mwangi Kipchoge Kiprono Omondi Wafula Mutua Njoroge Kariuki Juma Hassan Evans Duncan Felix Wycliffe Isaac`),
    F: w(`Mary Grace Faith Esther Joy Lucy Rose Wanjiru Akinyi Njeri Atieno Wambui Achieng Nyambura Chebet Jepchirchir Wairimu Mercy Jane Purity Beatrice Caroline Naomi Winnie Cynthia Sharon Ann Linet Judy Florence`),
    S: w(`Mwangi Otieno Kamau Ochieng Omondi Kiprono Mutua Njoroge Kariuki Karanja Macharia Odhiambo Onyango Wafula Wekesa Barasa Kimani Maina Githinji Mutiso Kibet Koech Rotich Cheruiyot Langat Kiplagat Mbugua Njenga Waweru Nyongesa Simiyu`),
  },
  ug: {
    label: '烏干達（干達語、英語名）', cat: 'Africa', order: 'given',
    M: w(`Moses Joseph John Peter David Robert Isaac Samuel Brian Ivan Fred Patrick Emmanuel Charles Richard Godfrey Ronald Denis Paul Julius Ben Sam Kenneth Arthur Henry Hassan Ismail Kato Mugisha Okello`),
    F: w(`Grace Sarah Mary Esther Juliet Doreen Prossy Harriet Annet Josephine Betty Sylvia Racheal Florence Agnes Stella Irene Ritah Brenda Winnie Gloria Christine Joan Jackline Immaculate Nakato Namukasa Nabirye Apio Akello`),
    S: w(`Mukasa Ssebunya Kato Okello Opio Mugisha Byaruhanga Tumusiime Kiwanuka Ssemakula Kakooza Musoke Mbabazi Ochieng Odong Atim Oryem Lubega Waiswa Wasswa Kizza Ssali Kyeyune Namugga Birungi Tumwine Ainebyona Muhwezi Ahimbisibwe Kyomuhendo`),
  },
  rw: {
    label: '盧安達／蒲隆地語', cat: 'Africa', order: 'given',
    M: w(`Jean_Claude Jean_Paul Jean_Baptiste Emmanuel Eric Patrick Innocent Olivier Claude Fabrice Didier Eugène Théogène Pacifique Jean_Pierre Aimable Védaste Bosco Félix Dieudonné Janvier Gaspard Cyprien Evariste Samuel Elie Joseph Alexis Prosper Léonard`),
    F: w(`Marie_Claire Immaculée Jeanne Claudine Alice Béatrice Chantal Solange Françoise Vestine Pascasie Josiane Espérance Clarisse Aline Providence Donatha Diane Jacqueline Odette Mukamana Uwase Ange Divine Josette Valentine Annonciata Epiphanie Domitille Liliane Consolée`),
    S: w(`Habimana Uwimana Ndayisaba Nsengiyumva Niyonzima Hakizimana Mugabo Ndayambaje Nkurunziza Bizimana Ndikumana Nzeyimana Havugimana Uwizeye Mutabazi Rugamba Munyaneza Nshimiyimana Sibomana Twagirayezu Ntakirutimana Mukiza Hitimana Ndahayo Karangwa Rukundo Ngabo Irakoze Nduwimana Bigirimana`),
  },
  am: {
    label: '阿姆哈拉語', cat: 'Africa', order: 'given', mode: 'patro', maiden: true,
    M: w(`Abebe Kebede Tadesse Girma Haile Mulugeta Getachew Dawit Yonas Solomon Tesfaye Bekele Alemayehu Berhanu Demeke Fikru Habtamu Mekonnen Negash Samson Tewodros Yohannes Zerihun Endale Henok Biniam Eyob Fasil Kidus Lemma Mesfin Teshome Worku Asfaw Ayele Bereket Desta Kassahun`),
    F: w(`Tigist Selam Meron Hanna Almaz Birtukan Alem Genet Aster Bethlehem Eden Fikirte Hiwot Lemlem Mulu Rahel Saron Senait Tsion Yeshi Zewditu Mekdes Meseret Netsanet Rediet Sosina Tirunesh Workitu Yeshiwork Zenebech Abeba Aberash Bezawit`),
    S: w(`Abebe Kebede Tadesse Girma Haile Mulugeta Getachew Dawit Yonas Solomon Tesfaye Bekele Alemayehu Berhanu Demeke Fikru Habtamu Mekonnen Negash Samson Tewodros Yohannes Zerihun Endale Henok Biniam Eyob Fasil Kidus Lemma Mesfin Teshome Worku Asfaw Ayele Bereket Desta Kassahun`),
  },
  orm: {
    label: '奧羅莫語', cat: 'Africa', order: 'given', mode: 'patro', maiden: true,
    M: w(`Bekele Gemechu Tolera Dereje Lencho Dinsa Kumsa Gutata Chala Jaldessa Tadesse Wakjira Feyisa Merga Abdisa Dida Jarso Bayissa Dandena Diriba Fufa Gadisa Gelana Habtamu Ibsa Leta Mosisa Nagasa Obsa Soreti Tufa Wako`),
    F: w(`Chaltu Bontu Birke Dinke Gifti Hawi Ayantu Bilise Kuli Lalise Meti Tume Waritu Nimona Sifan Mulu Gelane Roman Almaz Darartu Fantu Gadise Ifa Jalane Kume Lensa Marame Netsanet Obse Sena`),
    S: w(`Bekele Gemechu Tolera Dereje Lencho Dinsa Kumsa Gutata Chala Jaldessa Tadesse Wakjira Feyisa Merga Abdisa Dida Jarso Bayissa Dandena Diriba Fufa Gadisa Gelana Habtamu Ibsa Leta Mosisa Nagasa Obsa Soreti Tufa Wako`),
  },
  tig: {
    label: '提格利尼亞語', cat: 'Africa', order: 'given', mode: 'patro', maiden: true,
    M: w(`Tesfay Haile Berhane Kidane Mehari Yemane Gebre Mebrahtu Teklay Zerai Abraha Weldu Hagos Tekle Amanuel Samuel Semere Filmon Dawit Yonas Michael Ghebremedhin Asmerom Isayas Mussie Tewolde Fitsum Ghirmay Bereket Yohannes Kibrom`),
    F: w(`Selam Tsegereda Mizan Luwam Hiwet Medhin Rahel Senait Saba Eden Freweini Genet Kidan Meaza Meseret Nardos Rishan Sara Tigist Yordanos Zeineb Abrehet Aster Birikti Desta Haben Lemlem Saron Tsehaytu Wegahta Zebib`),
    S: w(`Tesfay Haile Berhane Kidane Mehari Yemane Gebre Mebrahtu Teklay Zerai Abraha Weldu Hagos Tekle Amanuel Samuel Semere Filmon Dawit Yonas Michael Ghebremedhin Asmerom Isayas Mussie Tewolde Fitsum Ghirmay Bereket Yohannes Kibrom`),
  },
  so: {
    label: '索馬利語', cat: 'Africa', order: 'given', mode: 'patro', maiden: true,
    M: w(`Mohamed Ahmed Abdi Abdullahi Ali Hassan Hussein Omar Yusuf Ismail Farah Warsame Jama Said Abdirahman Mahad Liban Guled Nur Osman Ibrahim Abdiwali Bashir Aden Elmi Hirsi Samatar Dahir Sharif Mukhtar`),
    F: w(`Fadumo Hodan Amina Ayaan Hawo Ifrah Sahra Halima Maryan Asha Ladan Sagal Khadija Nasra Hibo Idil Farhiya Nimo Dahabo Deqa Zamzam Muna Shukri Safiya Anab Saynab Ubah Hamdi Ikran Hanad`),
    S: w(`Mohamed Ahmed Abdi Abdullahi Ali Hassan Hussein Omar Yusuf Ismail Farah Warsame Jama Said Abdirahman Mahad Liban Guled Nur Osman Ibrahim Abdiwali Bashir Aden Elmi Hirsi Samatar Dahir Sharif Mukhtar`),
  },
  ha: {
    label: '豪薩語', cat: 'Africa', order: 'given',
    M: w(`Musa Abdullahi Ibrahim Usman Aminu Sani Bello Yusuf Ahmad Garba Ismail Suleiman Aliyu Idris Yakubu Mohammed Shehu Umar Abubakar Nasiru Lawal Auwal Mustapha Sadiq Tijjani Haruna Kabiru Salisu Bashir Danjuma Ado`),
    F: w(`Aisha Fatima Hauwa Zainab Maryam Amina Safiya Khadija Rabi Hadiza Binta Halima Hafsat Rukayya Asmau Zuwaira Balaraba Saadatu Jamila Nafisa Laraba Kande Dija Hajara Larai Ladi Rahma Habiba Bilkisu`),
    S: w(`Abdullahi Bello Danjuma Garba Sani Usman Yakubu Suleiman Musa Ibrahim Ahmed Aliyu Mohammed Lawal Idris Umar Abubakar Shehu Yusuf Ado Dantata Danladi Gambo Gwarzo Maigari Tanko Waziri Zakari Bagudu Dikko Galadima Mamman`),
  },
  yo: {
    label: '約魯巴語', cat: 'Africa', order: 'given',
    M: w(`Adebayo Olumide Tunde Segun Femi Babatunde Oluwaseun Ayodele Kunle Tayo Bolaji Dapo Gbenga Kayode Lekan Niyi Rotimi Sola Wale Yinka Folarin Damilola Ayomide Temitope Ifeoluwa Oluwatobi Adeola Kehinde Taiwo Olusegun Akin`),
    F: w(`Folake Yetunde Bukola Funmilayo Titilayo Adenike Omolara Abiola Bisi Damilola Modupe Morenike Oluwakemi Omotola Remi Sade Tolani Yewande Abimbola Bola Ibukun Kehinde Taiwo Temitope Toyin Wuraola Ronke Tope Ayo Funke Ife`),
    S: w(`Adeyemi Balogun Ogunleye Ojo Adeleke Afolabi Akinyemi Bamidele Fashola Ogunbanjo Adebisi Oyelaran Olawale Ajayi Adewale Alabi Oladipo Ogundipe Olaniyan Oyekan Akintola Adegoke Famuyiwa Salami Bankole Oduya Olatunji Adeniyi Ayinde Lawal Ogunsola`),
  },
  ig: {
    label: '伊博語', cat: 'Africa', order: 'given',
    M: w(`Emeka Chinedu Ifeanyi Obinna Chukwuemeka Nnamdi Ikenna Uchenna Kelechi Chidi Okechukwu Chibuike Ugochukwu Nonso Somto Ebuka Obiora Ejike Onyeka Chigozie Chijioke Tobenna Arinze Ositadinma Amaechi Nkem Ozioma Chike Echezona`),
    F: w(`Ngozi Chioma Adaeze Nkechi Oluchi Ifeoma Amaka Chiamaka Ugochi Nneka Ada Obiageli Uzoamaka Nkiruka Ijeoma Onyinye Chinwe Ebele Kamsi Ogechi Ifunanya Adaugo Chidinma Nneoma Ezinne Chinyere Ure Uju Ebere Ngozika`),
    S: w(`Okafor Okonkwo Eze Nwosu Nwankwo Obi Okeke Onyeama Nwachukwu Ibe Anyanwu Ugwu Okoro Udeh Nnaji Ezeh Chukwuma Igwe Emenike Ikwuemesi Ogbonna Ejiofor Iheanacho Mbah Uzoma Ezekwesili Azubuike Njoku Nwoye Ononiwu`),
  },
  ak: {
    label: '阿肯語（迦納）', cat: 'Africa', order: 'given',
    M: w(`Kwame Kofi Kojo Kwabena Yaw Kwaku Kwesi Nana Kwadwo Ebo Kobina Fiifi Papa Kweku Samuel Isaac Emmanuel Joseph Daniel Benjamin Kwasi Atta Prince Richard Michael Eric Francis Frederick Stephen`),
    F: w(`Ama Abena Akosua Adwoa Afia Akua Esi Yaa Efua Adjoa Araba Abenaa Afua Maame Serwaa Ekua Mansa Gifty Comfort Mercy Abigail Gloria Linda Janet Priscilla Dorcas Grace Nana_Ama Adwoa_Serwaa Ohenewaa`),
    S: w(`Mensah Boateng Owusu Asante Appiah Agyei Osei Ofori Amoah Darko Danso Frimpong Gyamfi Kyei Manu Nkrumah Opoku Quaye Sarpong Acheampong Adjei Antwi Asamoah Bonsu Donkor Kuffour Oduro Poku Yeboah Ansah`),
  },
  fw: {
    label: '法語西非（塞內加爾、馬利等）', cat: 'Africa', order: 'given', maiden: true,
    M: w(`Mamadou Ousmane Abdoulaye Seydou Ibrahima Moussa Amadou Issa Sekou Oumar Boubacar Cheikh Modou Alassane Lamine Idrissa Souleymane Bakary Aboubacar Yacouba Drissa Karim Adama Salif Mahamadou Moustapha Bouba Tidiane Papa Daouda`),
    F: w(`Fatou Aminata Awa Mariama Kadiatou Rokia Aissatou Mame Safiatou Binta Fanta Oumou Djénéba Coumba Ndeye Khady Mariam Aïcha Fatoumata Hawa Maïmouna Salimata Adjara Assétou Nafissatou Haby Sokhna Ramata Salamata Kadidia`),
    S: w(`Diallo Traoré Keita Sow Ndiaye Konaté Coulibaly Ouédraogo Sylla Diop Fall Sy Camara Cissé Barry Bah Touré Sangaré Doumbia Sidibé Koné Diarra Kaboré Sawadogo Zongo Bamba Fofana Sarr Gueye Faye Thiam Niang Mbaye Dembélé`),
  },
  sl: {
    label: '獅子山／賴比瑞亞／甘比亞（英語系西非）', cat: 'Africa', order: 'given',
    M: w(`Mohamed Abdul Alhaji Ibrahim Samuel Joseph Emmanuel Foday Sorie Santigie Alusine Musa Sahr Morlai Bockarie Ernest James John Prince Patrick Thomas Alfred Moses David Edward Augustine Saidu Lamin Sheku Francis`),
    F: w(`Fatmata Aminata Mariama Isatu Hawa Adama Kadiatu Fanta Memunatu Zainab Hannah Mabinty Salamatu Marie Josephine Comfort Mary Ruth Agnes Janet Beatrice Satta Yatta Musu Fatu Ramatu Christiana Sarah Mamie`),
    S: w(`Kamara Sesay Koroma Conteh Bangura Jalloh Turay Sankoh Mansaray Kanu Fofanah Bah Barrie Kallon Samura Johnson Cole Williams Thomas Davies Taylor Weah Kollie Toe Karnley Wilson Harris Doe Flomo Sirleaf Tubman`),
  },
  cf: {
    label: '法語中非（剛果、喀麥隆、加彭等）', cat: 'Africa', order: 'given', maiden: true,
    M: w(`Jean Patrick Joseph Pierre Christian Emmanuel Serge Didier Alain Guy Eric Rodrigue Fabrice Blaise Parfait Prosper Désiré Cédric Hervé Landry Jonathan Gaston Ghislain Bienvenu Kevin Trésor Fiston Dieudonné Héritier Jospin Junior`),
    F: w(`Marie Grace Espérance Jeanne Béatrice Solange Clarisse Ghislaine Bernadette Chantal Pauline Christelle Nadège Nicole Rose Sylvie Blandine Francine Mireille Prisca Divine Joëlle Flora Merveille Sarah Annie Chancelle Précieuse Rachel Gisèle`),
    S: w(`Mbala Kabila Tshisekedi Mukendi Kasongo Ilunga Mwamba Kalala Ngoy Lukusa Nkulu Mutombo Ndongo Ekambi Mbarga Onana Etoundi Fouda Nguema Obiang Ondo Bongo Mabiala Ngoma Sassou Nzambi Mavungu Kimbembe Mbemba Tchicaya Lumumba Mulumba Banza Kanyinda Tshimanga`),
  },
  lus: {
    label: '葡語非洲（安哥拉、莫三比克等）', cat: 'Africa', order: 'given',
    M: w(`João José António Manuel Francisco Domingos Joaquim Carlos Pedro Paulo Armando Fernando Eduardo Alberto Augusto Samuel Abel Jorge Mário Agostinho Faustino Celestino Sérgio Adriano Edson Délcio Nelson Jaime Ernesto Hélder Teodoro`),
    F: w(`Maria Ana Isabel Teresa Luzia Esperança Rosa Joana Celeste Fátima Graça Alice Albertina Amélia Carolina Domingas Filomena Gertrudes Helena Ilda Júlia Lurdes Natália Paula Rita Sandra Vitória Zulmira Cecília Conceição`),
    S: w(`Silva Santos Fernandes Gomes Mendes Neto Lopes Monteiro Fortes Vieira dos_Santos Pereira Costa Macuácua Chissano Machel Nhantumbo Cossa Mabunda Sitoe Tembe Mondlane Guambe Nhaca Manhiça Mucavele Bila Matsinhe Cumbe Miguel Pinto`),
  },
  zu: {
    label: '祖魯／科薩語', cat: 'Africa', order: 'given',
    M: w(`Thabo Sipho Themba Bongani Lungile Mandla Sibusiso Siyabonga Thulani Nkosana Vusi Mpho Kagiso Sizwe Luyanda Lwazi Andile Zola Mthunzi Sandile Mzwandile Xolani Zwelakhe Ayanda Bheki Musa Lunga Khaya Mlungisi Thando`),
    F: w(`Nomsa Thandiwe Zanele Lindiwe Nokuthula Thandeka Busisiwe Ntombi Zodwa Nomvula Lerato Ayanda Lungile Nosipho Phindile Sibongile Zinhle Nompumelelo Noxolo Nomfundo Palesa Siphokazi Sive Ntokozo Nonhlanhla Xoliswa Buhle Thembi Zukiswa Anele`),
    S: w(`Nkosi Dlamini Zulu Ndlovu Khumalo Sithole Mahlangu Mthembu Ngcobo Cele Mkhize Buthelezi Shabalala Zondi Gumede Radebe Nxumalo Ntuli Mabuza Ngubane Mbeki Sisulu Madikizela Nyathi Qwabe Mdluli Sibiya Mhlongo Ngwenya Msimang Hlongwane Majola Tshabalala Maseko`),
  },
  af_za: {
    label: '南非白人（阿非利卡語）', cat: 'Africa', order: 'given',
    M: w(`Johan Pieter Willem Hendrik Jacobus Francois Gerhard Christo Deon Andries Riaan Schalk Stefan Wynand Frikkie Danie Koos Hennie Louis Marius Jaco Pierre Dewald Ruan Corné Kobus Theuns Jannie Naas`),
    F: w(`Annelie Marietjie Elmarie Hester Magdalena Suzaan Anzél Charlene Elna Karien Lindie Maryke Mariaan Nadine Retha Sanet Tersia Wilma Yolandi Zelda Aletta Anneke Carien Chrisna Esmé Hannelie Ilze Jolene Lizette`),
    S: w(`Botha Van_der_Merwe Pretorius Du_Plessis Venter Kruger Steyn Joubert Viljoen Nel Swart Coetzee Fourie Du_Toit Marais Smit Van_Wyk Van_Zyl Le_Roux Louw Erasmus Bezuidenhout Jacobs Cilliers Meyer Rossouw Oosthuizen Strydom Visser Potgieter`),
  },
  sn: {
    label: '紹納語（辛巴威）', cat: 'Africa', order: 'given',
    M: w(`Tendai Tatenda Farai Kudzai Tapiwa Tafadzwa Takudzwa Munyaradzi Simbarashe Tinashe Blessing Brighton Learnmore Panashe Tawanda Kuda Nyasha Taurai Tonderai Fungai Edmore Givemore Lovemore Prosper Wellington Shingi Chenjerai Itai Ngoni`),
    F: w(`Rutendo Chipo Tariro Nyasha Memory Mercy Precious Rudo Tsitsi Vimbai Chiedza Fadzai Ruvimbo Shamiso Rumbidzai Sekai Tsungai Netsai Natsai Charity Patience Loveness Sharon Primrose Beauty Gladys Joyce Ellen Tendai`),
    S: w(`Moyo Ncube Sibanda Dube Mpofu Mutasa Makoni Mhlanga Chigumba Mashingaidze Chinamasa Gumbo Mudzuri Murambiwa Mhandu Marufu Chuma Zhou Chiweshe Nyoni Tembo Banda Gwenzi Mawire Makuvise Murape Matsika Chikore Madondo Mugabe`),
  },
  ny: {
    label: '契瓦／班巴語（馬拉威、尚比亞）', cat: 'Africa', order: 'given',
    M: w(`Chikondi Kondwani Chisomo Thoko Mphatso Yamikani Madalitso Limbani Chimwemwe Mwila Chanda Mulenga Kabwe Bwalya Mumba Kasonde Musonda Lubinda Chilufya Mwansa Kelvin Joseph Peter Patrick Moses Kennedy Dalitso Gift Patson Frank`),
    F: w(`Chimwemwe Memory Mercy Mwiza Tiyamike Thandiwe Esther Alice Grace Joyce Ruth Mary Ireen Chanda Mulenga Bupe Mwape Natasha Monica Beatrice Charity Faith Lillian Tamara Sarah Chileshe Namukolo Mutinta Mwaka Kasonde`),
    S: w(`Banda Phiri Mwale Tembo Zimba Mbewe Lungu Mumba Mulenga Chanda Mwansa Bwalya Kunda Sakala Zulu Daka Nyirenda Kaunda Chilufya Musonda Kabwe Chirwa Kalua Gondwe Mkandawire Msiska Njobvu Kachingwe Chisale Mvula`),
  },
  tn: {
    label: '茨瓦納／索托語', cat: 'Africa', order: 'given',
    M: w(`Thabo Tshepo Kabelo Lerato Neo Mpho Kagiso Tumelo Boitumelo Karabo Lebo Thato Bokang Katlego Kgosi Masego Mothusi Oratile Onalenna Orapeleng Refilwe Tebogo Teboho Tau Pule Ofentse Keabetswe Letlhogonolo Thapelo Tshiamo`),
    F: w(`Naledi Lerato Palesa Dineo Neo Refilwe Mpho Tshepiso Boitumelo Lesego Masego Kelebogile Onalenna Tshegofatso Keitumetse Gaone Kgomotso Itumeleng Lorato Mmabatho Nthabiseng Puleng Tebogo Thandi Pontsho Karabo Amogelang Bontle Omphile Dikeledi`),
    S: w(`Kgosi Modise Tau Mokoena Molefe Moloi Motsepe Mothibi Seretse Masire Khama Mogae Mosweu Ramaphosa Letsie Mohapi Makhele Sebego Kgotla Mabote Ntshole Moeketsi Mofokeng Ramokgopa Mphahlele Selepe Sello Thekiso Tladi Nkoane Mosia`),
  },
  ow: {
    label: '納米比亞（歐萬博語）', cat: 'Africa', order: 'given',
    M: w(`Johannes Sam Petrus Elia Festus Immanuel Nehemia Martin Simon Josef Abner Andreas Titus Mathias Fillemon Jeremia Hifikepunye Tangeni Panduleni Erastus Naftal Kalimbo Isak Ilmari Shaanika Thomas Paulus Lazarus Hendrik`),
    F: w(`Selma Saara Magdalena Maria Elizabeth Ndapewa Helena Johanna Emilia Penda Hileni Aini Ndahafa Tuyakula Rauha Martha Lahja Emma Anna Hertha Sylvia Rejoice Ndinelago Niita Ndilimeke Loide Ester Frieda Ottilie Monica`),
    S: w(`Nangolo Shikongo Amakali Shivute Shaningwa Haimbili Iyambo Nghipandulwa Hamukwaya Kuugongelwa Nujoma Pohamba Geingob Mbumba Namoloh Shilongo Amupanda Ndeitunga Hangula Shipanga Nashilongo Ekandjo Kandjii Haufiku Kapewasha Mushelenga Shiimi Nghidinwa Ithete Tjivikua`),
  },
  mg: {
    label: '馬達加斯加語', cat: 'Africa', order: 'given', maiden: true,
    M: w(`Hery Rado Faly Tojo Andry Mamy Solo Fenitra Tiana Njaka Fanilo Rivo Lalaina Haja Toky Heritiana Nirina Dina Fidy Mahefa Santatra Tsiory Aina Hasina Mirado Rojo Lova Koloina Zo`),
    F: w(`Voahangy Hanta Vola Lalao Noro Mialy Fara Soa Ony Mbola Nirina Tahiry Rina Fanja Lanja Haingo Sahondra Bako Vero Hasina Elisoa Miora Ravo Tantely Naina Rindra Sarobidy Lantoniaina Zo`),
    S: w(`Rakoto Rasoa Randria Rabe Ratsimbazafy Rakotomalala Andrianarisoa Razafy Rasolofo Rabemananjara Ravelojaona Rajaonarison Ranaivo Rakotonirina Randrianasolo Razanakolona Rasamoelina Rakotoarisoa Andriamanantena Rajoelina Ravalomanana Ramanantsoa Rakotondrabe Andrianjaka Raharison Rahajarizafy Ratsiraka Razakamanana Rafanomezantsoa Randriamampionona`),
  },
  nil: {
    label: '南蘇丹（丁卡、努爾語）', cat: 'Africa', order: 'given',
    M: w(`Deng Garang Majok Chol Kuol Akol Mading Bol Mabior Thon Lual Kiir Machar Gatluak Puok Jok Duop Reath Wal Tut Biar Gai Ruot Yoanes Peter James John Santino Moses Nhial Mayen`),
    F: w(`Nyandeng Nyabol Achol Adut Awut Nyaluak Ayen Akuol Nyanath Yar Ajak Atong Nyakim Rebecca Mary Susan Grace Sarah Rose Aluel Abuk Ayuen Anyieth Awien Alek Amer Nyanhial Nyakuoth Nyadak`),
    S: w(`Deng Garang Majok Chol Kuol Akol Mading Bol Mabior Thon Lual Kiir Machar Gatluak Puok Jok Duop Reath Wal Tut Biar Gai Ruot Mayom Aguer Ajang Atem Dau Lang Mayen Nhial`),
  },
  ru: {
    label: '俄語', cat: 'Europe', order: 'given', forms: true,
    M: w(`Alexander Dmitry Sergey Andrey Alexey Maxim Ivan Mikhail Nikolai Vladimir Pavel Yuri Igor Oleg Viktor Anton Artem Roman Denis Konstantin Evgeny Vasily Boris Anatoly Grigory Stanislav Ruslan Timofey Kirill Yaroslav`),
    F: w(`Anastasia Maria Olga Elena Natalia Tatiana Irina Svetlana Ekaterina Anna Yulia Daria Polina Victoria Oksana Galina Lyudmila Nadezhda Valentina Alina Ksenia Sofia Vera Marina Yana Larisa Kristina Alexandra Tamara Zoya`),
    S: w(`Ivanov|Ivanova Petrov|Petrova Sidorov|Sidorova Smirnov|Smirnova Kuznetsov|Kuznetsova Popov|Popova Volkov|Volkova Sokolov|Sokolova Lebedev|Lebedeva Kozlov|Kozlova Novikov|Novikova Morozov|Morozova Pavlov|Pavlova Orlov|Orlova Fedorov|Fedorova Mikhailov|Mikhailova Belov|Belova Tarasov|Tarasova Zaitsev|Zaitseva Kovalenko|Kovalenko Shevchenko|Shevchenko Bondarenko|Bondarenko Melnik|Melnik Tkachenko|Tkachenko Kravchenko|Kravchenko Boyko|Boyko Lysenko|Lysenko Moroz|Moroz Vasiliev|Vasilieva Egorov|Egorova Nikitin|Nikitina Frolov|Frolova`),
  },
  ua: {
    label: '烏克蘭語／白俄羅斯語', cat: 'Europe', order: 'given',
    M: w(`Oleksandr Mykola Andriy Serhiy Volodymyr Dmytro Ihor Taras Bohdan Yuriy Viktor Oleh Vasyl Petro Ivan Roman Maksym Artem Yaroslav Anatoliy Vitaliy Denys Pavlo Stepan Mykhailo Oleksiy Danylo Kostiantyn Vadym Ruslan`),
    F: w(`Olena Oksana Iryna Natalia Tetiana Svitlana Halyna Kateryna Maryna Yulia Liudmyla Larysa Anastasiia Daria Sofiia Yana Viktoriia Nadiia Valentyna Lesia Khrystyna Marta Solomiia Bohdana Alina Vira Zoriana Mariia Uliana Ruslana`),
    S: w(`Shevchenko Kovalenko Bondarenko Tkachenko Kravchenko Boyko Lysenko Moroz Melnyk Kovalchuk Marchenko Savchenko Petrenko Honchar Rudenko Polishchuk Hrytsenko Kuzmenko Ponomarenko Tymoshenko Klymenko Oliynyk Shevchuk Bilyk Sydorenko Kharchenko Yakovenko Zinchenko Romanenko Stetsenko`),
  },
  pl: {
    label: '波蘭語', cat: 'Europe', order: 'given', forms: true,
    M: w(`Jan Piotr Tomasz Marek Paweł Krzysztof Michał Jakub Andrzej Stanisław Adam Marcin Łukasz Grzegorz Mateusz Kamil Wojciech Robert Rafał Dariusz Szymon Maciej Bartosz Jacek Zbigniew Kazimierz Tadeusz Wiktor Filip`),
    F: w(`Anna Katarzyna Magdalena Agnieszka Zofia Małgorzata Barbara Ewa Joanna Maria Krystyna Monika Aleksandra Natalia Julia Maja Zuzanna Alicja Weronika Dorota Beata Halina Teresa Danuta Karolina Paulina Marta Justyna Iwona`),
    S: w(`Nowak|Nowak Kowalski|Kowalska Wiśniewski|Wiśniewska Wójcik|Wójcik Kowalczyk|Kowalczyk Kamiński|Kamińska Lewandowski|Lewandowska Zieliński|Zielińska Szymański|Szymańska Woźniak|Woźniak Dąbrowski|Dąbrowska Kozłowski|Kozłowska Jankowski|Jankowska Mazur|Mazur Kwiatkowski|Kwiatkowska Krawczyk|Krawczyk Piotrowski|Piotrowska Grabowski|Grabowska Pawłowski|Pawłowska Michalski|Michalska Król|Król Wieczorek|Wieczorek Jabłoński|Jabłońska Wróbel|Wróbel Majewski|Majewska Olszewski|Olszewska Stępień|Stępień Malinowski|Malinowska Jaworski|Jaworska Adamczyk|Adamczyk`),
  },
  cs: {
    label: '捷克語／斯洛伐克語', cat: 'Europe', order: 'given', forms: true,
    M: w(`Jan Petr Pavel Jiří Tomáš Lukáš Martin Jakub Josef Michal Marek Ondřej Vojtěch Filip David Radek Miroslav Karel Zdeněk Václav Roman Daniel Štěpán Matěj Adam Ladislav Milan Peter Juraj Dušan`),
    F: w(`Jana Lucie Petra Tereza Eva Hana Lenka Marie Anna Kateřina Veronika Barbora Kristýna Markéta Zuzana Michaela Alena Božena Jitka Ivana Monika Martina Simona Eliška Dagmar Jarmila Katarína Mária Adriana Silvia`),
    S: w(`Novák|Nováková Svoboda|Svobodová Dvořák|Dvořáková Černý|Černá Procházka|Procházková Kučera|Kučerová Veselý|Veselá Horák|Horáková Němec|Němcová Marek|Marková Pospíšil|Pospíšilová Pokorný|Pokorná Hájek|Hájková Král|Králová Jelínek|Jelínková Růžička|Růžičková Beneš|Benešová Fiala|Fialová Sedláček|Sedláčková Doležal|Doležalová Zeman|Zemanová Kolář|Kolářová Navrátil|Navrátilová Čermák|Čermáková Urban|Urbanová Kopecký|Kopecká Bartoš|Bartošová`),
  },
  hr: {
    label: '克羅埃西亞語／斯洛維尼亞語', cat: 'Europe', order: 'given',
    M: w(`Ivan Marko Josip Ante Mario Luka Ivica Nikola Tomislav Zoran Davor Darko Mladen Goran Dario Filip Matej Petar Mihovil Branimir Krešimir Zvonimir Stjepan Franjo Dino Jure Andrej Matija Anže Žiga Jan`),
    F: w(`Marija Ana Ivana Maja Katarina Petra Martina Nikolina Jelena Tea Mateja Lucija Ema Sara Ivona Marina Mirela Vesna Dubravka Branka Zrinka Nives Tihana Barbara Nina Urška Špela Tjaša Maša Eva`),
    S: w(`Horvat Kovačević Babić Marić Jurić Novak Kovač Knežević Vuković Matić Perić Tomić Pavlović Božić Blažević Bošnjak Grgić Pavić Radić Šarić Filipović Lovrić Vidović Petrović Kralj Zupančič Kos Golob Krajnc Vidmar Potočnik Mlakar`),
  },
  sr: {
    label: '塞爾維亞語', cat: 'Europe', order: 'given',
    M: w(`Aleksandar Nikola Marko Stefan Miloš Milan Dragan Zoran Goran Nenad Dejan Vladimir Branko Bojan Dušan Ivan Luka Filip Đorđe Uroš Petar Srđan Slobodan Miodrag Radovan Vuk Veljko Mihailo Lazar Bogdan`),
    F: w(`Jelena Milica Ivana Snežana Biljana Dragana Vesna Tanja Mirjana Jovana Marija Ana Teodora Anja Sara Katarina Nevena Tamara Marina Olivera Slavica Ljiljana Svetlana Radmila Mila Dunja Sofija Isidora Nađa`),
    S: w(`Petrović Jovanović Nikolić Marković Đorđević Stojanović Ilić Popović Pavlović Todorović Simić Stanković Milošević Kovačević Radovanović Lazić Mitrović Ristić Vasić Obradović Savić Lukić Tomić Janković Ivanović Mihajlović Marinković Božić Filipović Knežević Dimitrijević`),
  },
  bg: {
    label: '保加利亞語／馬其頓語', cat: 'Europe', order: 'given', forms: true,
    M: w(`Georgi Ivan Dimitar Nikolay Petar Stefan Hristo Todor Aleksandar Vasil Krasimir Plamen Stoyan Kiril Boris Atanas Yordan Martin Svetoslav Radoslav Ventsislav Miroslav Zlatko Emil Veselin Rosen Kalin Angel Lyubomir Boyan`),
    F: w(`Maria Ivanka Elena Yordanka Desislava Radka Stanimira Tsvetana Svetla Silvia Nadezhda Gergana Katerina Viktoria Diana Pavlina Vesela Daniela Rositsa Albena Dobrinka Kalina Teodora Iva Boryana Milena Sevdalina Raya Zornitsa Mariya`),
    S: w(`Georgiev|Georgieva Ivanov|Ivanova Dimitrov|Dimitrova Petrov|Petrova Nikolov|Nikolova Hristov|Hristova Stoyanov|Stoyanova Todorov|Todorova Angelov|Angelova Vasilev|Vasileva Popov|Popova Kolev|Koleva Iliev|Ilieva Marinov|Marinova Yordanov|Yordanova Atanasov|Atanasova Stefanov|Stefanova Kirilov|Kirilova Tsvetkov|Tsvetkova Zhelev|Zheleva Borisov|Borisova Mihaylov|Mihaylova Yanev|Yaneva Panayotov|Panayotova Mladenov|Mladenova Radev|Radeva Bonev|Boneva Petkov|Petkova`),
  },
  bs: {
    label: '波士尼亞語（穆斯林）', cat: 'Europe', order: 'given',
    M: w(`Emir Amar Adnan Kemal Haris Mirza Armin Edin Sead Samir Nermin Alen Elvir Tarik Damir Almir Senad Jasmin Faruk Dino Eldin Muhamed Mustafa Admir Anel Harun Ismar Ibrahim Elmir Vedad`),
    F: w(`Amra Lejla Selma Emina Aida Jasmina Alma Amela Merima Azra Sabina Elma Ajla Belma Mirela Sanela Zerina Amina Dalila Nejra Ilma Lamija Emira Naida Medina Samra Zehra Hana Nermina Ajša`),
    S: w(`Hodžić Hadžić Kovačević Delić Mujić Begić Čengić Softić Šabanović Imamović Mehmedović Hasanović Alić Husić Kurtović Omerović Memić Sarajlić Karić Ibrahimović Bajrić Salihović Zukić Smajić Mulalić Ćatić Kadrić Avdić Halilović Kapetanović Džaferović`),
  },
  sq: {
    label: '阿爾巴尼亞語', cat: 'Europe', order: 'given',
    M: w(`Arben Besnik Dritan Fatmir Gezim Ilir Kujtim Luan Agim Altin Bujar Erion Genc Klodian Leart Ermal Endri Flamur Blerim Albert Ardian Valon Granit Driton Burim Shkelzen Liridon Visar Dardan Arian`),
    F: w(`Arta Blerta Drita Elira Fjolla Lule Mimoza Nora Rozafa Shpresa Teuta Vjollca Zana Albana Besa Dafina Edona Flora Gentiana Jeta Liridona Merita Nertila Rina Suela Valbona Yllka Era Dhurata Ardiana`),
    S: w(`Hoxha Shehu Kola Berisha Gashi Krasniqi Rama Dervishi Prifti Leka Mema Basha Hasani Gjoka Marku Dhima Nika Kelmendi Morina Bytyqi Hysa Kastrati Aliu Zogu Meta Xhafa Ahmeti Sopi Daka Hysi`),
  },
  de: {
    label: '德語', cat: 'Europe', order: 'given',
    M: w(`Lukas Jonas Felix Leon Maximilian Paul Niklas Tobias Stefan Thomas Michael Andreas Jan Peter Klaus Hans Jürgen Markus Florian Sebastian Daniel Matthias Christian Wolfgang Dieter Frank Bernd Uwe Dirk Sven Heinz Rolf`),
    F: w(`Anna Lena Mia Hannah Sophie Laura Julia Katharina Sabine Petra Monika Ursula Claudia Andrea Birgit Heike Susanne Christine Nicole Stefanie Jana Lisa Marie Charlotte Greta Ingrid Helga Renate Gisela Eva Katja Gabriele`),
    S: w(`Müller Schmidt Schneider Fischer Weber Meyer Wagner Becker Schulz Hoffmann Schäfer Koch Bauer Richter Klein Wolf Schröder Neumann Schwarz Zimmermann Braun Krüger Hofmann Hartmann Lange Schmitt Werner Krause Meier Lehmann Keller`),
  },
  fr: {
    label: '法語', cat: 'Europe', order: 'given',
    M: w(`Jean Pierre Michel Philippe Alain Louis Nicolas Julien Thomas Antoine Lucas Hugo Gabriel Maxime Mathieu Olivier Laurent Stéphane Guillaume Sébastien François Étienne Bastien Romain Clément Théo Arnaud Baptiste Yann Rémi`),
    F: w(`Marie Camille Léa Chloé Manon Emma Julie Sophie Isabelle Nathalie Catherine Sylvie Valérie Céline Aurélie Claire Élodie Laure Margaux Océane Inès Juliette Charlotte Mélanie Anaïs Pauline Amélie Delphine Hélène Agnès`),
    S: w(`Martin Bernard Dubois Thomas Robert Richard Petit Durand Leroy Moreau Simon Laurent Lefebvre Michel Garcia David Bertrand Roux Vincent Fournier Morel Girard André Lefèvre Mercier Dupont Lambert Bonnet François Martinez`),
  },
  it: {
    label: '義大利語', cat: 'Europe', order: 'given',
    M: w(`Giuseppe Giovanni Antonio Marco Luca Francesco Alessandro Andrea Matteo Lorenzo Davide Simone Stefano Paolo Roberto Salvatore Vincenzo Riccardo Federico Gabriele Fabio Massimo Claudio Enrico Pietro Daniele Nicola Carlo Emanuele Tommaso`),
    F: w(`Maria Anna Giulia Francesca Chiara Sara Martina Valentina Elena Laura Paola Silvia Alessia Elisa Federica Roberta Simona Monica Daniela Cristina Angela Rosa Lucia Teresa Giorgia Serena Ilaria Beatrice Caterina Antonella`),
    S: w(`Rossi Russo Ferrari Esposito Bianchi Romano Colombo Ricci Marino Greco Bruno Gallo Conti De_Luca Mancini Costa Giordano Rizzo Lombardi Moretti Barbieri Fontana Santoro Mariani Rinaldi Caruso Ferrara Galli Martini Leone`),
  },
  mt: {
    label: '馬爾他語', cat: 'Europe', order: 'given',
    M: w(`Joseph Mario Charles Anthony Paul Carmel Michael George John Francis Joe Victor Kevin Daniel Jonathan Matthew Etienne Clayton Kurt Ryan Mark Noel Reuben Luke Nicholas Steve Edward Raymond Philip Duncan`),
    F: w(`Maria Josephine Mary Anna Catherine Carmen Rita Doris Joanne Claire Lara Sarah Rachel Marthese Lourdes Antonella Roberta Michelle Charlene Jessica Stephanie Natasha Christine Audrey Mireille Rosanne Francesca Therese Dorianne`),
    S: w(`Borg Camilleri Vella Farrugia Zammit Galea Micallef Grech Attard Spiteri Azzopardi Cassar Debono Pace Mifsud Bonnici Fenech Caruana Muscat Sciberras Agius Abela Portelli Xuereb Schembri Buttigieg Mizzi Gatt Saliba Calleja`),
  },
  es_es: {
    label: '西班牙語（西班牙）', cat: 'Europe', order: 'given', maiden: true,
    M: w(`José Juan Carlos Luis Miguel Jorge Pedro Antonio Manuel Francisco Javier Diego Alejandro Andrés Sergio Daniel Fernando Ricardo Rafael Pablo Hugo Mateo Santiago Sebastián Emiliano Gustavo Ernesto Rodrigo Álvaro Iván Óscar`),
    F: w(`María Carmen Ana Laura Isabel Lucía Sofía Valentina Camila Daniela Paula Marta Elena Rosa Teresa Pilar Gabriela Fernanda Andrea Carolina Natalia Patricia Claudia Lorena Mariana Alejandra Rocío Verónica Beatriz Silvia`),
    S: w(`García Rodríguez González Fernández López Martínez Sánchez Pérez Gómez Martín Jiménez Ruiz Hernández Díaz Moreno Álvarez Muñoz Romero Alonso Gutiérrez Navarro Torres Domínguez Vázquez Ramos Gil Ramírez Serrano Blanco Castro Ortega`),
  },
  pt_pt: {
    label: '葡萄牙語（葡萄牙）', cat: 'Europe', order: 'given', maiden: true,
    M: w(`João José António Manuel Francisco Carlos Paulo Pedro Rui Miguel Luís Tiago Diogo Ricardo Fernando André Nuno Hugo Bruno Rodrigo Vasco Duarte Afonso Gonçalo Filipe Jorge Joaquim Armando Mário Fábio`),
    F: w(`Maria Ana Beatriz Inês Mariana Sofia Catarina Joana Rita Teresa Margarida Leonor Carolina Matilde Marta Filipa Sónia Susana Fátima Helena Isabel Patrícia Cristina Sandra Paula Raquel Cátia Daniela Alexandra Lúcia`),
    S: w(`Silva Santos Ferreira Pereira Oliveira Costa Rodrigues Martins Jesus Sousa Fernandes Gonçalves Gomes Lopes Marques Alves Almeida Ribeiro Pinto Carvalho Teixeira Moreira Correia Mendes Nunes Soares Vieira Monteiro Cardoso Rocha Lima`),
  },
  nl: {
    label: '荷蘭語', cat: 'Europe', order: 'given',
    M: w(`Jan Pieter Willem Hendrik Johannes Cornelis Jeroen Sander Daan Sem Lucas Thijs Bram Joost Ruben Maarten Niels Stijn Wouter Kees Gerrit Henk Rob Martijn Tim Koen Lars Mathijs Jelle Floris`),
    F: w(`Anna Maria Johanna Emma Julia Sophie Lotte Femke Sanne Fleur Anouk Eva Lisa Marieke Ingrid Saskia Marloes Esther Annemiek Maaike Floor Iris Merel Roos Noor Tess Linda Wilma Hanneke Jolien`),
    S: w(`de_Vries Jansen van_den_Berg Bakker Visser Smit Meijer de_Boer Mulder de_Groot Bos Vos Peters Hendriks van_Dijk Dekker van_der_Meer Brouwer de_Wit Dijkstra Smits de_Graaf van_Leeuwen Kok Jacobs van_der_Linden Willems Maas Verhoeven Koster`),
  },
  nord: {
    label: '北歐語（瑞典、挪威、丹麥）', cat: 'Europe', order: 'given',
    M: w(`Erik Lars Anders Johan Karl Nils Olof Sven Magnus Henrik Mikael Jonas Oskar Emil Axel William Mattias Bjørn Søren Mads Jens Lasse Ole Kristian Gustav Hans Thomas Peter Morten Rasmus Sigurd`),
    F: w(`Anna Maria Eva Karin Ingrid Astrid Sofia Emma Linnea Elin Hanna Sara Kristina Lena Maja Freja Ida Signe Camilla Mette Sofie Liv Helene Elsa Saga Maren Kirsten Lone Tone Silje Ingeborg`),
    S: w(`Johansson Andersson Karlsson Nilsson Eriksson Larsson Olsson Persson Svensson Gustafsson Hansen Nielsen Jensen Pedersen Andersen Larsen Olsen Berg Lindberg Halvorsen Lund Dahl Jørgensen Christensen Sørensen Rasmussen Hagen Bakken Haugen Eklund Lindqvist`),
  },
  fi: {
    label: '芬蘭語', cat: 'Europe', order: 'given',
    M: w(`Mikko Juhani Matti Timo Jari Kalle Ville Antti Pekka Jukka Heikki Markku Petri Tuomas Ilkka Lauri Jussi Olli Sami Teemu Janne Harri Esa Kimmo Veikko Eino Aarne Onni Eetu Juho Aleksi`),
    F: w(`Aino Helmi Marja Johanna Tuula Pirjo Elsa Anneli Kaarina Sari Maria Päivi Leena Hanna Riitta Tiina Minna Katja Laura Emilia Venla Sofia Aada Ella Eveliina Liisa Anu Kirsi Outi Jaana Tarja`),
    S: w(`Korhonen Virtanen Mäkinen Nieminen Mäkelä Hämäläinen Laine Heikkinen Koskinen Järvinen Lehtonen Lehtinen Saarinen Salminen Heinonen Niemi Heikkilä Kinnunen Salonen Turunen Salo Laitinen Tuominen Rantanen Karjalainen Hiltunen Ahonen Jokinen Lahtinen Hakala`),
  },
  el: {
    label: '希臘語', cat: 'Europe', order: 'given',
    M: w(`Giorgos Dimitris Nikos Giannis Kostas Panagiotis Christos Vasilis Thanasis Manolis Stavros Alexandros Spyros Michalis Antonis Petros Andreas Yiannis Lefteris Haris Takis Sotiris Apostolos Kyriakos Pavlos Argyris Fotis Stelios Tasos Marios`),
    F: w(`Maria Eleni Katerina Georgia Sofia Anna Dimitra Vasiliki Ioanna Christina Evangelia Despina Angeliki Konstantina Athina Zoi Irini Paraskevi Aikaterini Efi Natasa Eirini Marina Theodora Voula Stavroula Lina Foteini Panagiota Ourania`),
    S: w(`Papadopoulos Georgiou Nikolaou Dimitriou Papadakis Vasileiou Ioannou Karagiannis Pappas Konstantinou Oikonomou Alexiou Michailidis Antoniou Makris Angelopoulos Theodorou Christodoulou Kyriakou Anastasiou Petrou Stavrou Athanasiou Lazaridis Papanikolaou Vlachos Zografos Manolis Galanis Economou`),
  },
  ro: {
    label: '羅馬尼亞語', cat: 'Europe', order: 'given',
    M: w(`Ion Mihai Andrei Alexandru Gheorghe Vasile Constantin Nicolae Cristian Marius Florin Adrian Ionuț Daniel Bogdan Radu Cătălin Sorin Dan Răzvan Ștefan Liviu Octavian Vlad Emil Teodor Lucian Mircea Cosmin George`),
    F: w(`Maria Elena Ioana Ana Andreea Mihaela Cristina Gabriela Alexandra Daniela Georgiana Simona Monica Raluca Diana Roxana Larisa Carmen Camelia Loredana Irina Oana Alina Laura Nicoleta Viorica Florentina Ramona Corina Adriana`),
    S: w(`Popescu Ionescu Popa Stan Dumitru Gheorghe Stoica Constantin Rusu Munteanu Matei Marin Serban Mihai Ciobanu Dinu Lupu Preda Tudor Barbu Cristea Diaconu Moldovan Ilie Radu Dobre Vasile Toma Anghel Neagu`),
  },
  hu: {
    label: '匈牙利語', cat: 'Europe', order: 'family', sep: ' ',
    M: w(`István László József János Zoltán Sándor Gábor Ferenc Attila Péter Tamás András Imre Balázs Csaba Gergő Dániel Máté Bence Zsolt Miklós Károly Lajos Béla Levente Ádám Richárd Dávid Kristóf Norbert`),
    F: w(`Mária Erzsébet Katalin Ilona Éva Zsuzsanna Judit Ágnes Anna Margit Ildikó Andrea Krisztina Eszter Réka Viktória Nóra Anikó Orsolya Dóra Hajnalka Bernadett Zsófia Boglárka Gabriella Edina Tímea Lilla Fanni Emese`),
    S: w(`Nagy Kovács Tóth Szabó Horváth Varga Kiss Molnár Németh Farkas Balogh Papp Takács Juhász Lakatos Mészáros Oláh Simon Rácz Fekete Szilágyi Török Fehér Balázs Gál Kis Szűcs Kocsis Pintér Fodor Orbán`),
  },
  lt: {
    label: '立陶宛語', cat: 'Europe', order: 'given', forms: true,
    M: w(`Jonas Petras Antanas Kazimieras Algirdas Vytautas Mindaugas Tomas Darius Andrius Rokas Lukas Mantas Paulius Gediminas Arūnas Rimantas Saulius Justinas Dainius Ignas Edvinas Giedrius Marius Linas Kęstutis Donatas Vaidotas Tadas`),
    F: w(`Ona Marija Jūratė Rasa Giedrė Dalia Ingrida Jolanta Rūta Aistė Eglė Monika Kristina Austėja Gabija Ieva Lina Vilma Daiva Aurelija Birutė Gintarė Indrė Laima Neringa Rima Simona Viktorija Živilė Akvilė`),
    S: w(`Kazlauskas|Kazlauskaitė Petrauskas|Petrauskaitė Jankauskas|Jankauskaitė Stankevičius|Stankevičiūtė Vasiliauskas|Vasiliauskaitė Žukauskas|Žukauskaitė Butkus|Butkutė Paulauskas|Paulauskaitė Urbonas|Urbonaitė Kavaliauskas|Kavaliauskaitė Navickas|Navickaitė Sakalauskas|Sakalauskaitė Balčiūnas|Balčiūnaitė Rimkus|Rimkutė Baranauskas|Baranauskaitė Mockus|Mockutė Žilinskas|Žilinskaitė Adomaitis|Adomaitytė Kairys|Kairytė Pocius|Pociūtė Grigas|Grigaitė Norkus|Norkutė Mikalauskas|Mikalauskaitė Ramanauskas|Ramanauskaitė Šimkus|Šimkutė Gudaitis|Gudaitytė Lukošius|Lukošiūtė Budrys|Budrytė Rutkauskas|Rutkauskaitė Sinkevičius|Sinkevičiūtė Matulevičius|Matulevičiūtė`),
  },
  lv: {
    label: '拉脫維亞語', cat: 'Europe', order: 'given', forms: true,
    M: w(`Jānis Andris Mārtiņš Edgars Kristaps Aivars Ivars Juris Raimonds Artūrs Gatis Māris Roberts Valdis Normunds Ainārs Kārlis Rihards Oskars Dainis Uldis Arnis Ēriks Toms Guntis Imants Jēkabs Pēteris Viesturs Vilnis`),
    F: w(`Anna Līga Inese Ilze Dace Agnese Laima Zane Santa Baiba Linda Elīna Evija Kristīne Ieva Sanita Gunta Dzintra Māra Maija Vita Ruta Anita Aija Daina Marta Liene Everita Ance Olga`),
    S: w(`Bērziņš|Bērziņa Kalniņš|Kalniņa Ozoliņš|Ozoliņa Jansons|Jansone Liepiņš|Liepiņa Krūmiņš|Krūmiņa Balodis|Balode Eglītis|Eglīte Zariņš|Zariņa Pētersons|Pētersone Vītoliņš|Vītoliņa Kļaviņš|Kļaviņa Siliņš|Siliņa Ozols|Ozola Sprogis|Sproge Lācis|Lāce Mežs|Meža Rozītis|Rozīte Vanags|Vanaga Apsītis|Apsīte Straume|Straume Jaunzems|Jaunzeme Grīnbergs|Grīnberga Lapiņš|Lapiņa Kruze|Kruze Bergs|Berga Millers|Millere Gailis|Gaile Dzenis|Dzene`),
  },
  et: {
    label: '愛沙尼亞語', cat: 'Europe', order: 'given',
    M: w(`Jaan Tõnu Mati Andres Toomas Raivo Rein Peeter Margus Priit Kristjan Tanel Rasmus Martin Madis Kaarel Karl Siim Mihkel Marko Ando Indrek Heiki Urmas Taavi Erik Hendrik Kaspar Jüri Ott`),
    F: w(`Mari Maria Anne Kadri Kristi Liis Katrin Tiina Piret Merike Helen Kaja Reet Ave Epp Ülle Maarja Karin Triin Eve Mare Lea Külli Heli Anu Annika Kerli Marika Aet Tiiu`),
    S: w(`Tamm Saar Sepp Mägi Kask Kukk Rebane Ilves Koppel Põld Lepik Oja Kallas Karu Pärn Raud Kuusk Liiv Mets Vaher Luik Kangur Teder Lill Roos Paju Laan Sild Peterson Ots`),
  },
  en_gb: {
    label: '英語（英國）', cat: 'Europe', order: 'given',
    M: w(`Oliver George Harry Jack Jacob Charlie Thomas Oscar William James Henry Alfie Archie Freddie Noah Arthur Leo Joshua Daniel Edward Alexander Callum Ryan Liam Connor Adam Luke Stuart Graham Gareth Neil Ian Colin`),
    F: w(`Olivia Amelia Isla Ava Emily Isabella Mia Poppy Ella Lily Sophie Charlotte Grace Evie Freya Florence Alice Ruby Chloe Hannah Megan Rebecca Sarah Laura Emma Kirsty Hayley Sian Fiona Jennifer`),
    S: w(`Smith Jones Taylor Brown Williams Wilson Johnson Davies Robinson Wright Thompson Evans Walker White Roberts Green Hall Wood Jackson Clarke Harris Edwards Turner Martin Cooper Hill Ward Morris Moore King Watson Baker`),
  },
  en_ie: {
    label: '英語（愛爾蘭）', cat: 'Europe', order: 'given',
    M: w(`Seán Patrick Conor Liam Cian Eoin Darragh Oisín Fionn Niall Declan Brendan Colm Ciarán Donal Kevin Michael John James Aidan Cathal Padraig Ronan Shane Kieran Diarmuid Tadhg Rory Dara`),
    F: w(`Aoife Saoirse Niamh Ciara Siobhán Orla Róisín Sinéad Caoimhe Gráinne Aisling Clodagh Mairead Fiona Eimear Máire Deirdre Eileen Bridget Sarah Emma Katie Sorcha Nuala Maeve Una Aine Cliona Brigid Síle`),
    S: w(`Murphy Kelly O'Sullivan Walsh Smith O'Brien Byrne Ryan O'Connor O'Neill O'Reilly Doyle McCarthy Gallagher Doherty Kennedy Lynch Murray Quinn Moore McLoughlin O'Carroll Connolly Daly Connell Wilson Dunne Brennan Burke Collins Kavanagh Healy`),
  },
  en_us: {
    label: '英語（美、加、澳、紐）', cat: 'Americas & Oceania', order: 'given',
    M: w(`James John Michael David Robert William Thomas Daniel Matthew Andrew Christopher Joseph Ryan Joshua Nathan Samuel Benjamin Jack Tyler Brandon Justin Austin Caleb Dylan Ethan Logan Mason Noah Liam Lucas Jayden Anthony`),
    F: w(`Mary Patricia Jennifer Linda Elizabeth Susan Jessica Sarah Karen Emily Olivia Emma Ashley Brittany Madison Megan Samantha Hannah Taylor Kayla Amanda Rachel Lauren Alexis Abigail Natalie Sophia Ava Isabella Mia`),
    S: w(`Smith Johnson Williams Brown Jones Miller Davis Wilson Taylor Anderson Thomas Moore Martin Jackson Thompson White Harris Clark Lewis Robinson Walker Young Allen King Wright Scott Green Baker Adams Nelson Hill`),
  },
  es_la: {
    label: '西班牙語（拉丁美洲）', cat: 'Americas & Oceania', order: 'given', maiden: true,
    M: w(`José Juan Luis Carlos Miguel Jorge Pedro Antonio Manuel Francisco Javier Diego Alejandro Andrés Fernando Ricardo Rafael Mateo Santiago Sebastián Emiliano Gustavo Ernesto Rodrigo Iván Óscar Cristian Brayan Jesús Héctor Raúl Armando Eduardo`),
    F: w(`María Guadalupe Carmen Ana Laura Isabel Lucía Sofía Valentina Camila Daniela Paola Gabriela Fernanda Andrea Carolina Natalia Patricia Claudia Lorena Mariana Alejandra Rocío Verónica Yesenia Jessica Karen Brenda Ximena Luz Rosario`),
    S: w(`Hernández García Martínez López González Rodríguez Pérez Sánchez Ramírez Flores Gómez Díaz Cruz Reyes Morales Torres Gutiérrez Ortiz Chávez Ruiz Jiménez Mendoza Vargas Castillo Rojas Silva Herrera Medina Aguilar Vega Castro Romero`),
  },
  es_and: {
    label: '西班牙語（安第斯）', cat: 'Americas & Oceania', order: 'given', maiden: true,
    M: w(`Juan José Luis Carlos Jorge Víctor Edwin Wilfredo Rolando Néstor Fredy Percy Wilber Elmer Walter Richard Hugo Julio Marco Alfredo Efraín Nelson Rubén Edgar Ever Freddy Hilario Marcelino Eusebio Ciro`),
    F: w(`María Rosa Juana Elena Julia Nelly Rosario Flor Marleni Yessenia Rocío Karina Lourdes Gladys Ruth Sonia Yolanda Betty Norma Elsa Luz Mery Dora Fabiola Esperanza Zulema Mirian Vilma Edith`),
    S: w(`Quispe Mamani Huamán Condori Flores Choque Chambi Apaza Ccama Vargas Gutiérrez Rojas Torres Colque Cusi Yupanqui Paucar Huanca Ramos Mendoza Cruz Pari Sirpa Limachi Callisaya Poma Tito Challco Ticona Layme`),
  },
  mya: {
    label: '馬雅語系（瓜地馬拉）', cat: 'Americas & Oceania', order: 'given',
    M: w(`Juan José Pedro Miguel Mario Carlos Manuel Santos Domingo Francisco Gaspar Baltazar Esteban Tomás Marcos Lucas Nicolás Andrés Diego Mateo Felipe Bartolo Sebastián Pablo Rigoberto Tiburcio Ricardo Elías Luis Mauricio`),
    F: w(`María Juana Rosa Ana Petrona Catarina Magdalena Isabel Marta Juliana Lucía Cristina Antonia Francisca Manuela Candelaria Dominga Tomasa Teresa Sebastiana Pascuala Elena Gabriela Rufina Margarita Carmen Silvia Lidia Sandra`),
    S: w(`Tzoc Ajanel Chavajay Xol Ajpop Tzul Cumes Batz Tuy Coc Pop Chub Caal Tiul Choc Cac Xicay Cuc Cotzal Sipac Tum Raxón Sajvin Ixcot Menchú Toj Tohom Quiej Pérez`),
  },
  pt_br: {
    label: '巴西葡萄牙語', cat: 'Americas & Oceania', order: 'given',
    M: w(`Gabriel Lucas Pedro Mateus Guilherme Gustavo Rafael Felipe Bruno Matheus Thiago Leonardo Eduardo Vinícius André Henrique Márcio Rodrigo Marcelo Fernando Carlos João José Antônio Paulo Luiz Ricardo Diego Caio Davi Arthur`),
    F: w(`Maria Ana Beatriz Mariana Juliana Camila Larissa Letícia Amanda Bruna Aline Patrícia Vanessa Carla Luciana Paula Sandra Cristina Helena Isabela Daniela Raquel Eduarda Fernanda Gabriela Jéssica Thaís Luana Rafaela`),
    S: w(`Silva Santos Oliveira Souza Rodrigues Ferreira Alves Pereira Lima Gomes Costa Ribeiro Martins Carvalho Almeida Lopes Soares Fernandes Vieira Barbosa Rocha Dias Nascimento Andrade Moreira Nunes Marques Machado Mendes Freitas Cardoso`),
  },
  carib: {
    label: '英語加勒比海', cat: 'Americas & Oceania', order: 'given',
    M: w(`Marcus Andre Dwayne Devon Kemar Jermaine Omar Rohan Shane Shawn Kareem Jamal Tyrone Marlon Leroy Desmond Winston Everton Clive Orville Delroy Garfield Nigel Kevon Rashad Akeem Jevon Lennox Kirk Rondell`),
    F: w(`Shanice Tanisha Keisha Alicia Natalie Marcia Sasha Simone Latoya Kerryann Tamika Donna Sharon Pauline Beverly Jacqueline Yvonne Michelle Chantelle Shellyann Sherece Kadian Joy Marva Cherise Monique Nadine Alecia Camille Roxanne Janelle`),
    S: w(`Brown Campbell Williams Henry Johnson Thompson Clarke Edwards Reid Francis Morgan Grant Bailey Gordon Richards Lewis Samuels Walker Wright Blake Bennett Rodney Marshall Thomas Phillips McKenzie Foster Ramsay Haynes Hinds Forbes`),
  },
  ht: {
    label: '海地克里奧爾語', cat: 'Americas & Oceania', order: 'given',
    M: w(`Jean Pierre Joseph Wilfrid Frantz Ronald Emmanuel Wilner Jonas Fritz Marc Patrick Kervens Mackenson Kenson Dieuseul Wilson Evens Roosevelt Gesner Josué Steeve Widmaier Wisler Jocelyn Yves Rodolphe Jean_Baptiste Daniel Samuel`),
    F: w(`Marie Rose Esther Nadège Mirlande Fabienne Carline Roseline Guerline Marie_Ange Yolande Magalie Ketlyne Wideline Naomie Sherly Myriam Johanne Mislande Fedline Lovely Nathalie Rachelle Darline Ginette Micheline Manoucheka Béatrice Widlyne`),
    S: w(`Jean Pierre Joseph Louis Charles Baptiste Saint_Louis Etienne Augustin Dorval Toussaint Désir Michel Fleury Paul Jacques Thomas Bien_Aimé Célestin Noël Dumas Exantus Laurent Philippe Belizaire Duval Alexandre Cadet Lafontant Desrosiers`),
  },
  es_car: {
    label: '西班牙語（加勒比海）', cat: 'Americas & Oceania', order: 'given', maiden: true,
    M: w(`José Luis Juan Carlos Pedro Yunior Yoel Eduardo Rafael Manuel Ángel Jorge Miguel Félix Wilson Starlin Robinson Francisco Roberto Reynaldo Santiago Orlando Raúl Osvaldo Lázaro Yusniel Alexei Dayron Leonel Juniel`),
    F: w(`María Yamilet Yaneisy Yudith Yadira Mayra Ana Luz Rosa Carmen Altagracia Yesenia Yohanna Massiel Mirian Dayana Marlene Magaly Odalys Idalmis Yanet Zoila Milagros Xiomara Yanelis Liset Ariadna Cándida Mercedes Ramona`),
    S: w(`Rodríguez Pérez González Hernández García Martínez Díaz Fernández López Sánchez Gómez Ramírez Cruz Reyes Santana Peña Mejía Jiménez Báez Batista Almonte Polanco Vargas Núñez Rosario Medina Colón Ortiz Rivera Torres Santiago Marrero Pagán Cabrera`),
  },
  pac_pol: {
    label: '太平洋島民（毛利、薩摩亞、東加）', cat: 'Americas & Oceania', order: 'given',
    M: w(`Tane Rangi Hemi Wiremu Rawiri Tipene Mikaere Tamati Hohepa Pita Sione Tevita Mosese Viliami Siaosi Lopeti Semisi Soane Ioane Tui Alofa Lemalu Iosefa Fetu Manu Kalani Nikau Malakai Folau`),
    F: w(`Aroha Mere Hine Ngaire Maia Kiri Anahera Huia Whetu Moana Ana Sina Mele Losa Ofa Lupe Salote Seini Litia Sisilia Talia Ioana Teuila Leilani Mahina Tui Lani Mereana Ngahuia`),
    S: w(`Tuilagi Faleolo Leota Lemalu Fuimaono Sua Alo Fifita Havili Taufa Tupou Latu Vea Fonua Kioa Lavulo Piutau Folau Moala Palu Ngata Parata Tamihana Hohepa Te_Rangi Wiremu Rewi Karaitiana Tawhai Pomare Manihera`),
  },
  png: {
    label: '巴布亞紐幾內亞／索羅門群島', cat: 'Americas & Oceania', order: 'given',
    M: w(`John Peter Michael Joseph Paul Francis Moses Thomas Kevin Steven Gabriel Jacob Simon Isaac Elijah Jeffrey Max Nicholas Allan Benny Bruno Alois Lucas Daniel Ben Sam Jimmy Joe Tom`),
    F: w(`Mary Anna Margaret Elizabeth Jenny Rose Naomi Rachel Ruth Esther Agnes Sarah Helen Lucy Christine Diana Priscilla Susan Joyce Betty Rebecca Lydia Cathy Maria Grace Julie Magdalene Teresa Janet`),
    S: w(`Kila Wama Namaliu Somare Marape Pato Kaupa Kombo Tau Gari Kulu Wari Ketan Ila Rabi Kua Maino Kasa Wapi Yagi Aua Kamilo Waigani Tamate Kapi Kopi Kewa Boge Mondo`),
  },
  fj: {
    label: '斐濟語', cat: 'Americas & Oceania', order: 'given',
    M: w(`Josefa Ilisoni Semi Jone Isireli Apisai Epeli Peni Sakiusa Waisea Viliame Inia Timoci Rusiate Sireli Nemani Mosese Tevita Aisea Eroni Savenaca Jioji Laisenia Naiqama Isoa Ame Kitione Marika Esala`),
    F: w(`Salote Mere Litia Lusiana Torika Sera Ana Losalini Unaisi Mereseini Selina Eseta Makereta Lavenia Ilisapeci Vika Mesake Taina Akosita Naomi Rosi Kelera Sulueti Apolonia Asenaca Salanieta Luisa Nanise Adi_Mere`),
    S: w(`Naqelevuki Ravuvu Vuniwaqa Waqa Tamani Cakobau Tuivaga Nailatikau Tora Tikoduadua Daunivalu Seru Nawalowalo Nakauvadra Raikoti Bola Sovasova Rokotuiviwa Ravouvou Qarase Rabuka Bainimarama Mara Ganilau Kubuabola Tabu Vosanibola Nawaikula Vunivalu`),
  },
};

for (const g of Object.values(GROUPS)) if (g.mode === 'patro') g.S = g.M;

export const GROUP_KEYS = Object.keys(GROUPS);

// ---- Country -> groups ----------------------------------------------------------------------------
// "group:weight" pairs (weights are relative, roughly the population share in percent).

const CG = {
  // East Asia
  CHN: 'zh_hans', JPN: 'ja', KOR: 'ko', PRK: 'ko', TWN: 'zh_hant', HKG: 'zh_hant', MAC: 'zh_hant', MNG: 'mn',
  // Southeast Asia
  IDN: 'id', PHL: 'fil', VNM: 'vi', THA: 'th', MMR: 'my', KHM: 'km', LAO: 'lo',
  MYS: 'ms:62 zh_hans:22 ta:7 id:9', SGP: 'zh_hans:73 ms:14 ta:9 en_gb:4', TLS: 'pt_pt:70 id:30',
  // South Asia
  IND: 'hi:40 ur:9 mr:8 te:8 bn_hi:7 ta:6 gu:5 kn:4 ml:3 pa:2',
  PAK: 'ur:84 ps_dari:16', BGD: 'bn:92 bn_hi:8', AFG: 'ps_dari', NPL: 'ne', LKA: 'si:74 ta:20 ur:6', BTN: 'dz', MDV: 'dv',
  // Central Asia
  UZB: 'uz_tk:84 tg:5 ru:6 kk_ky:5', KAZ: 'kk_ky:70 ru:23 uz_tk:4 ua:3', AZE: 'az', TJK: 'tg:84 uz_tk:13 ru:3',
  KGZ: 'kk_ky:73 uz_tk:15 ru:12', TKM: 'uz_tk:90 ru:10',
  // Middle East & North Africa
  EGY: 'ar_nile', IRN: 'fa:80 az:16 ku:4', TUR: 'tr:82 ku:16 ar_levant:2', DZA: 'ar_maghreb', IRQ: 'ar_levant:60 ar_gulf:20 ku:20',
  MAR: 'ar_maghreb', SAU: 'ar_gulf', YEM: 'ar_gulf', SYR: 'ar_levant:88 ku:10 hy:2', TUN: 'ar_maghreb', JOR: 'ar_levant',
  ISR: 'he:75 ar_levant:21 ru:4', LBY: 'ar_maghreb', LBN: 'ar_levant', PSE: 'ar_levant', OMN: 'ar_gulf:70 hi:10 ur:8 bn:6 ml:3 ar_nile:3',
  ARE: 'ar_gulf:40 hi:25 ur:15 ar_nile:8 fil:5 ar_levant:5 ml:2', KWT: 'ar_gulf:58 ar_nile:12 hi:12 ar_levant:8 ur:5 fil:5',
  QAT: 'ar_gulf:45 hi:20 ar_nile:10 ur:8 fil:7 ar_levant:6 ne:4', BHR: 'ar_gulf:55 hi:15 ur:10 bn:7 ar_nile:5 fil:5 ml:3',
  // Sub-Saharan Africa
  NGA: 'ha:36 yo:26 ig:24', ETH: 'am:40 orm:36 tig:8 so:6', COD: 'cf', TZA: 'sw', ZAF: 'zu:78 af_za:11 en_gb:6 hi:2',
  KEN: 'ke:92 sw:6 hi:2', UGA: 'ug', SDN: 'ar_nile:92 nil:8', AGO: 'lus', GHA: 'ak', MOZ: 'lus', MDG: 'mg', CIV: 'fw',
  CMR: 'cf', NER: 'ha:55 fw:45', BFA: 'fw', MLI: 'fw', MWI: 'ny', ZMB: 'ny', TCD: 'cf:50 ar_nile:50', SOM: 'so', SEN: 'fw',
  ZWE: 'sn:82 zu:18', GIN: 'fw', RWA: 'rw', BEN: 'fw', BDI: 'rw', SSD: 'nil', TGO: 'fw', SLE: 'sl', COG: 'cf', CAF: 'cf',
  LBR: 'sl', MRT: 'ar_maghreb:80 fw:20', ERI: 'tig', GMB: 'fw:60 sl:40', BWA: 'tn', NAM: 'ow:80 af_za:12 en_gb:5 de:3',
  GAB: 'cf', LSO: 'tn', GNB: 'lus:55 fw:45', GNQ: 'cf:60 es_la:40', MUS: 'hi:55 fr:30 ur:12 zh_hans:3', SWZ: 'zu', DJI: 'so:70 ar_gulf:30',
  COM: 'sw:50 ar_gulf:50', CPV: 'lus',
  // Latin America & Caribbean
  BRA: 'pt_br', MEX: 'es_la', COL: 'es_la', ARG: 'es_la:78 it:14 es_es:8', PER: 'es_la:55 es_and:45', VEN: 'es_la', CHL: 'es_la',
  ECU: 'es_la:80 es_and:20', GTM: 'es_la:55 mya:45', BOL: 'es_and:60 es_la:40', HTI: 'ht', DOM: 'es_car', CUB: 'es_car',
  HND: 'es_la', NIC: 'es_la', PRY: 'es_la', SLV: 'es_la', CRI: 'es_la', PAN: 'es_la:88 carib:12', URY: 'es_la:80 it:12 es_es:8',
  PRI: 'es_car', JAM: 'carib', TTO: 'carib:56 hi:38 zh_hans:1 en_gb:5', GUY: 'carib:55 hi:40 en_gb:5',
  SUR: 'carib:35 hi:30 id:15 nl:10 zh_hans:3',
  // North America & Oceania
  USA: 'en_us:73 es_la:17 hi:2 zh_hans:1.5 fil:1.2 vi:1.2 ko:1 ar_levant:1 carib:1.5 pl:0.6',
  CAN: 'en_us:62 fr:21 zh_hans:4 hi:3 pa:2.5 fil:2.5 ar_levant:1.5 es_la:1.5 it:1',
  AUS: 'en_us:76 en_gb:6 zh_hans:5 hi:3 ar_levant:2 vi:1.5 fil:1.5 it:1 el:1 pac_pol:1 en_ie:1',
  NZL: 'en_us:68 pac_pol:20 zh_hans:5 hi:4 en_gb:3', PNG: 'png', FJI: 'fj:58 hi:38 en_gb:2 zh_hans:2', SLB: 'png:94 pac_pol:6',
  // Europe
  RUS: 'ru', DEU: 'de:86 tr:5 pl:3 ru:2 ar_levant:2 it:2', FRA: 'fr:86 ar_maghreb:8 fw:3 pt_pt:2 it:1', GBR: 'en_gb:84 hi:4 ur:3 pl:2 en_ie:2 carib:2 bn:1 zh_hans:1 ',
  ITA: 'it:93 ro:3 ar_maghreb:2 sq:2', ESP: 'es_es:92 ar_maghreb:3 es_la:3 ro:2', POL: 'pl', UKR: 'ua:82 ru:15 ro:1 hu:1 pl:1',
  ROU: 'ro:92 hu:8', NLD: 'nl:90 tr:3 ar_maghreb:4 id:2 carib:1', BEL: 'nl:55 fr:38 ar_maghreb:5 it:2', SWE: 'nord:88 fi:3 ar_levant:4 sr:3 so:2',
  CZE: 'cs', GRC: 'el', PRT: 'pt_pt:95 lus:3 pt_br:2', HUN: 'hu', BLR: 'ru:55 ua:40 pl:5', AUT: 'de:88 sr:4 tr:4 bs:2 ro:2',
  CHE: 'de:62 fr:23 it:8 pt_pt:3 sr:2 tr:2', SRB: 'sr:88 hu:3 bs:3 sq:3 ro:3', BGR: 'bg:85 tr:9 ro:6', DNK: 'nord:92 tr:2 ar_levant:3 pl:3',
  SVK: 'cs:83 hu:9 ua:8', FIN: 'fi:93 nord:5 ru:2', NOR: 'nord:92 pl:3 ar_levant:2 so:3', IRL: 'en_ie:90 pl:3 en_gb:6 ro:1',
  HRV: 'hr:92 sr:4 bs:4', GEO: 'ka:87 az:7 hy:6', MDA: 'ro:75 ru:13 ua:8 bg:4', BIH: 'bs:50 sr:32 hr:18', ALB: 'sq', ARM: 'hy',
  LTU: 'lt:85 pl:6 ru:5 ua:4', SVN: 'hr:88 sr:5 bs:5 sq:2', MKD: 'bg:60 sq:25 sr:6 tr:5 bs:4', LVA: 'lv:62 ru:33 ua:3 pl:2',
  XKX: 'sq:92 sr:5 tr:3', EST: 'et:69 ru:25 ua:3 fi:3', CYP: 'el:77 tr:18 en_gb:5', LUX: 'fr:30 de:30 pt_pt:25 it:7 en_gb:4 nl:4',
  MNE: 'sr:70 bs:15 sq:10 hr:5', MLT: 'mt',
};

/** country code -> [[groupKey, probability], ...] (probabilities sum to 1). */
export const COUNTRY_GROUPS = {};
for (const [code, spec] of Object.entries(CG)) {
  const list = spec.trim().split(/\s+/).map((p) => {
    const [k, wt] = p.split(':');
    return [k, wt === undefined ? 1 : +wt];
  });
  const total = list.reduce((a, b) => a + b[1], 0);
  COUNTRY_GROUPS[code] = list.map(([k, wt]) => [k, wt / total]);
}

/** Fallback when a country has no explicit entry: the region's most common group. */
const REGION_DEFAULT = {
  EAS: 'zh_hans', SEA: 'id', SAS: 'hi', CAS: 'uz_tk', MENA: 'ar_levant', SSA: 'fw', EUR: 'en_gb', NAM: 'en_us', LAC: 'es_la', OCE: 'en_us',
};

/** Keys used by saves made before the groups were introduced. */
const LEGACY_KEYS = {
  zh: 'zh_hant', in: 'hi', pk: 'ur', bd: 'bn', lk: 'si', ca: 'uz_tk', ar: 'ar_levant', af_w: 'fw', af_e: 'sw', af_s: 'zu', af_c: 'cf',
  en: 'en_us', ph: 'fil', mm: 'my', es: 'es_es', pt: 'pt_br', cee: 'pl', cauc: 'ka',
};

function groupOf(key) {
  return GROUPS[key] || GROUPS[LEGACY_KEYS[key]] || GROUPS.en_us;
}

/** Group record for a key (legacy keys of old saves are translated). */
export function getPool(key) {
  return groupOf(key);
}
export const getGroup = getPool;
export const POOL_KEYS = GROUP_KEYS;

/** The groups of a country with their probabilities. */
export function groupsForCountry(code, region = null) {
  return COUNTRY_GROUPS[code] || [[REGION_DEFAULT[region] || 'en_us', 1]];
}

/** Draw one group for a person born in / living in the country. `rng` returns [0, 1). */
export function drawGroup(code, rng, region = null) {
  const list = groupsForCountry(code, region);
  let r = rng();
  for (const [k, p] of list) {
    if (r < p) return k;
    r -= p;
  }
  return list[list.length - 1][0];
}

/** The most common group of a country (used where one deterministic answer is needed). */
export function poolKeyFor(country) {
  const list = groupsForCountry(country.code, country.region);
  return list.reduce((best, cur) => (cur[1] > best[1] ? cur : best))[0];
}

// ---- Name generation -----------------------------------------------------------------------------

const pickOf = (list, rng) => list[Math.min(list.length - 1, Math.floor(rng() * list.length))];
const forms = (token, gender) => {
  const [m, f] = token.split('|');
  return gender === 'F' ? (f || m) : m;
};

/**
 * Compose a name. `rng` is a function returning [0,1). `familyOverride` forces the family-name token
 * (a child inheriting from the father; '' forces a single name). Returns
 * { given, family, full, familyToken, givenToken } - the tokens are what children inherit
 * (see childFamilyToken).
 */
export function makeName(groupKey, gender, rng, familyOverride = null) {
  const g = groupOf(groupKey);
  const givens = gender === 'F' ? g.F : g.M;
  const givenToken = pickOf(givens, rng);
  let familyToken;
  if (g.mode === 'syll') {
    const rest = givens.filter((t) => t !== givenToken);
    familyToken = familyOverride !== null && familyOverride !== undefined ? familyOverride : pickOf(rest, rng);
  } else if (familyOverride !== null && familyOverride !== undefined) familyToken = familyOverride;
  else if (g.singleP && rng() < g.singleP) familyToken = '';
  else familyToken = pickOf(g.S, rng);
  return composeName(groupKey, gender, givenToken, familyToken);
}

/** Build the display strings from raw tokens. */
export function composeName(groupKey, gender, givenToken, familyToken = '') {
  const g = groupOf(groupKey);
  let given, family, full;
  if (g.mode === 'ko') {
    const [gh, gc] = givenToken.split('|'), [fh, fc] = (familyToken || '|').split('|');
    given = gh; family = fh;
    full = gc && gc !== gh && fc ? `${fh}${gh}（${fc}${gc}）` : `${fh}${gh}`;
  } else if (g.mode === 'syll') {
    given = givenToken; family = '';
    full = familyToken ? `${givenToken} ${familyToken}` : givenToken;
  } else if (g.mode === 'patro') {
    given = givenToken; family = familyToken || '';
    const particle = g.particle ? ` ${g.particle[gender] || g.particle.M}` : '';
    full = family ? `${given}${particle} ${family}` : given;
  } else {
    given = givenToken;
    family = familyToken ? (g.forms ? forms(familyToken, gender) : familyToken) : '';
    if (!family) full = given;
    else if (g.order === 'family') full = `${family}${g.sep ?? ''}${given}`;
    else full = g.mid ? `${given} ${g.mid[gender] || g.mid.M} ${family}` : `${given} ${family}`;
  }
  return { given, family, full, familyToken: familyToken || '', givenToken };
}

/**
 * The family-name token a child inherits from its father, given the father's name tokens
 * ({ givenToken, familyToken }). Patronymic cultures use the father's given name; cultures with
 * personal two-part names (Burmese ...) give each child a fresh name (null).
 */
export function childFamilyToken(groupKey, father = {}) {
  const g = groupOf(groupKey);
  if (g.mode === 'syll') return null;
  if (g.mode === 'patro') return father.givenToken || null;
  return father.familyToken === undefined ? null : father.familyToken;
}

/** A mother's family-name token: her own (random) one where women keep their names, else the family's. */
export function motherFamilyToken(groupKey, familyToken, rng) {
  const g = groupOf(groupKey);
  if (g.mode === 'syll') return null;
  if (g.mode === 'patro') return pickOf(g.M, rng);
  return g.maiden ? pickOf(g.S, rng) : familyToken;
}

/** Number of given names / family names of a group; used by tests. */
export function poolSizes(key) {
  const p = groupOf(key);
  return { M: p.M.length, F: p.F.length, S: p.S.length };
}
