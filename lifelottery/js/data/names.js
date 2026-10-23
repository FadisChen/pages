// Name pools. Every pool has male given names (M), female given names (F) and surnames (S),
// each with >= 30 entries. Pools are grouped by culture, not strictly by country; countries map
// to a pool through POOL_BY_COUNTRY (falling back to the region default).
//
// Token formats (space separated in the source strings):
//   plain        Mary
//   a|b          Korean "hangul|hanja" (ko), or Slavic "masculine|feminine" surname (ru, cee)
//
// Display orders: zh/ja = family+given without space; ko = hangul family+given plus hanja in
// full-width brackets; vi = family first with spaces; everything else = given + space + family.
//
// Names are stored as the strings the player sees (Traditional Chinese for Chinese names,
// Japanese kanji for Japan, hangul + hanja for Korea, Latin transliteration elsewhere).

const w = (s) => s.trim().split(/\s+/);

const POOLS = {
  // ---------------- East Asia ----------------
  zh: {
    order: 'family',
    M: w('志明 家豪 建宏 俊傑 宗翰 柏翰 承恩 冠宇 彥廷 宇軒 哲維 子豪 明德 國強 文傑 偉倫 浩然 立偉 書豪 信宏 榮華 大偉 一鳴 嘉樂 啟聖 子軒 品睿 昱翔 志偉 振華 博文 天佑'),
    F: w('淑芬 雅婷 怡君 佩珊 欣怡 靜宜 詩涵 宜蓁 雨婷 美玲 秀英 惠雯 曉晴 佳穎 玉蘭 麗華 心怡 家瑜 芷涵 思穎 瑞芳 婉如 雅雯 紫涵 若彤 玉珍 嘉欣 慧敏 語嫣 梓晴 敏君 翠萍'),
    S: w('陳 林 黃 張 李 王 吳 劉 蔡 楊 許 鄭 謝 郭 洪 曾 邱 廖 賴 徐 周 葉 蘇 莊 呂 江 何 蕭 羅 高 潘 簡 朱 鍾'),
  },
  ja: {
    order: 'family',
    M: w('蓮 湊 大翔 陽翔 悠真 樹 颯太 健太 翔太 拓海 大輝 隼人 直樹 誠 和也 浩二 達也 康平 雄一 修 剛 裕太 光 一郎 龍之介 慎吾 智也 圭介 亮 勇気 秀樹 政男'),
    F: w('葵 結衣 陽菜 莉子 美咲 凛 芽依 紬 愛 さくら 彩花 優花 千尋 真由美 恵子 由美 久美子 裕子 智子 明美 加奈 沙織 理恵 菜々子 美穂 楓 花音 里奈 麻衣 春香 典子 幸子'),
    S: w('佐藤 鈴木 高橋 田中 伊藤 渡辺 山本 中村 小林 加藤 吉田 山田 佐々木 山口 松本 井上 木村 林 清水 山崎 阿部 森 池田 橋本 石川 前田 藤田 小川 後藤 岡田 長谷川'),
  },
  ko: {
    order: 'family',
    M: w('민준|民俊 서준|瑞俊 도윤|道允 지훈|志勳 현우|賢宇 준호|俊昊 성민|成敏 동현|東賢 재원|宰源 상우|尙宇 태양|太陽 영수|永洙 정훈|廷勳 승현|承賢 기범|基範 우진|宇鎭 철수|哲洙 대호|大浩 병철|炳哲 진우|鎭宇 경수|京洙 한솔|한솔 민석|民錫 용준|龍俊 석진|錫珍 재현|在賢 지환|志煥 형준|亨俊 태민|泰民 수빈|秀彬 건우|建雨'),
    F: w('서연|瑞妍 하윤|夏潤 지우|智雨 서윤|瑞潤 수아|秀雅 지민|智敏 예은|藝恩 채원|彩媛 민지|珉智 유진|裕眞 은지|恩智 혜진|惠珍 수진|秀珍 영희|英姬 미경|美京 순자|順子 정숙|貞淑 지은|智恩 소연|素妍 다은|多恩 하은|河恩 윤아|潤我 보라|寶羅 나연|娜姸 가영|佳英 선영|善英 현주|賢珠 은서|恩瑞 아영|雅英 시은|始恩 유나|裕娜'),
    S: w('김|金 이|李 박|朴 최|崔 정|鄭 강|姜 조|趙 윤|尹 장|張 임|林 한|韓 오|吳 서|徐 신|申 권|權 황|黃 안|安 송|宋 류|柳 홍|洪 전|全 고|高 문|文 양|梁 손|孫 배|裵 백|白 허|許 남|南 노|盧 하|河 곽|郭'),
  },
  // ---------------- Southeast Asia ----------------
  vi: {
    order: 'family',
    M: w('Văn_An Minh_Quân Hoàng_Nam Quốc_Anh Đức_Huy Thanh_Tùng Văn_Hùng Anh_Tuấn Việt_Dũng Hữu_Phước Ngọc_Sơn Công_Minh Trung_Kiên Thành_Long Gia_Bảo Đình_Khoa Xuân_Trường Văn_Thắng Hải_Đăng Quang_Vinh Tiến_Đạt Bảo_Long Văn_Lâm Khánh_Duy Minh_Khôi Văn_Toàn Hồng_Phúc Thế_Anh Văn_Cường Đăng_Khoa').map((x) => x.replace('_', ' ')),
    F: w('Thị_Lan Thu_Hà Ngọc_Anh Thị_Hoa Minh_Thư Khánh_Linh Thị_Mai Bảo_Ngọc Thanh_Hương Thị_Thảo Hồng_Nhung Phương_Anh Thùy_Linh Thu_Trang Kim_Ngân Diệu_Linh Thị_Hạnh Ngọc_Mai Thị_Hương Quỳnh_Anh Mỹ_Linh Hoài_An Thanh_Trúc Thị_Yến Bích_Ngọc Tuyết_Mai Thị_Nga Cẩm_Tú Thảo_Vy Thị_Cúc Xuân_Mai').map((x) => x.replace('_', ' ')),
    S: w('Nguyễn Trần Lê Phạm Hoàng Huỳnh Phan Vũ Võ Đặng Bùi Đỗ Hồ Ngô Dương Lý Đinh Trịnh Đoàn Lương Mai Tô Cao Lâm Hà Thái Tạ Châu Quách Kiều'),
  },
  th: {
    order: 'given',
    M: w('Somchai Somsak Prasert Anan Kittipong Surasak Thanakorn Chaiwat Pichai Wichai Sombat Narong Apichart Weerasak Tawan Nattapong Kasem Boonmee Sakchai Thawatchai Wirat Chatchai Preecha Sarawut Teerapong Pongsakorn Anurak Chakrit Manit Saran Krit'),
    F: w('Somying Malee Siriporn Pranee Nittaya Supaporn Kanya Wanida Ratana Sunisa Pimchanok Arunee Jintana Kulap Napaporn Orathai Suda Watcharee Busaba Chanida Duangjai Laddawan Manee Narumon Patcharee Rujira Sudarat Thanida Uraiwan Yaowalak Anong'),
    S: w('Saetang Srisai Wongsawat Chaiyasit Boonmee Rattanakorn Suksawat Thongchai Prasertsuk Kaewmanee Sirikul Phromma Jaidee Wongchai Sukhum Charoen Pattanasin Rungruang Thanakit Sombun Phetcharat Srisuk Kittisak Intharat Namwong Chantarasak Mahasan Promsuwan Siripong Laohaphan Pongpan'),
  },
  id: {
    order: 'given',
    M: w('Budi Agus Andi Dedi Eko Rizki Fajar Hendra Joko Bayu Yusuf Ahmad Rudi Wahyu Dimas Hasan Irfan Slamet Teguh Bambang Arif Rahmat Iwan Surya Yoga Gilang Adi Heru Putra Reza Haris'),
    F: w('Siti Dewi Sri Ratna Putri Ayu Wulan Rina Fitri Indah Lestari Nur Yuni Ani Tri Maya Rani Intan Dian Endang Sari Lia Mega Citra Nia Wati Eka Rahma Aisyah Kartika'),
    S: w('Saputra Santoso Wijaya Hidayat Setiawan Kurniawan Pratama Nugroho Susanto Wibowo Lestari Hartono Gunawan Siregar Nasution Simanjuntak Harahap Purnomo Rahman Firmansyah Hakim Utama Permana Maulana Ramadhan Suryadi Kusuma Handayani Yulianto Halim Siahaan'),
  },
  ph: {
    order: 'given',
    M: w('Juan Jose Mark Jerome Angelo Rafael Miguel Paolo Carlo Joel Ramon Ricardo Eduardo Noel Dennis Arnel Reynaldo Rodel Jun Bong Jayson Kevin Christian Nathaniel Gabriel Manuel Danilo Ernesto Felipe Rolando Benjamin'),
    F: w('Maria Ana Rosario Corazon Teresita Luzviminda Jasmine Angelica Michelle Joanna Grace Mary_Jane Cristina Liza Nenita Marites Rowena Juanita Lourdes Imelda Carmela Bea Shiela Kristine Maricel Jennifer Arlene Divina Gina Aileen Princess').map((x) => x.replace('_', ' ')),
    S: w('Santos Reyes Cruz Bautista Ocampo Garcia Mendoza Torres Tomas Andrada Castillo Flores Villanueva Ramos Aquino Dela_Cruz Gonzales Rivera Navarro Domingo Pascual Salazar Manalo Aguilar Soriano Mercado Lopez Hernandez Perez Fernandez').map((x) => x.replace('_', ' ')),
  },
  mm: {
    order: 'given',
    M: w('Aung Kyaw Zaw Htet Min Thura Ye Naing Than Myo Soe Tun Hlaing Win Khin Kyi Phyo Zin Sithu Thein Maung Nyi Lin Htun Moe Pyae Tin Zayar Ko Hein'),
    F: w('Khin Thin Aye Mya Nandar Su Hnin Ei Thandar Moe Cho Phyu Yadanar Swe Myat Wai Thazin San May Nilar Kay Khaing Zin Thida Hla Yin Mi Sandar Yamin Nu'),
    S: w('Aung Kyaw Win Htun Zaw Naing Oo Lwin Myint Tun Soe Maung Thein Lin Hlaing Thet Min Than Htay Khaing Swe Tin Nyunt Shwe Mya Phyo San Hein Ko Yin'),
  },
  km: {
    order: 'family',
    M: w('Sokha Dara Vannak Sovann Rithy Pich Sopheak Chea Narith Samnang Veasna Bunthoeun Visal Sambath Piseth Kosal Chanthou Vibol Sophal Sreng Rath Phalla Makara Vuthy Sary Channa Bora Heng Sothea Samrith'),
    F: w('Sreymom Sophea Chantha Sokunthea Bopha Srey Kunthea Davy Maly Sreyneang Chenda Pheakdey Vanna Rachana Sothy Leakhena Phally Thida Sambo Kolap Sopheap Chanry Dany Rotha Nary Sreypov Sinath Sokly Chamroeun Mealea'),
    S: w('Chea Sok Heng Kong Ly Khem Meas Pich Chhun Ouk Keo Lim Phan Sam Yim Chan Srey Touch Hun Mao Pen Ros Prak Nguon Hout Seng Chhay Thong Lay Vong'),
  },
  // ---------------- South / Central Asia ----------------
  in: {
    order: 'given',
    M: w('Rahul Amit Raj Vikram Sanjay Arjun Rohan Anil Suresh Ravi Manoj Deepak Karthik Ramesh Vijay Pradeep Sunil Ajay Naveen Prakash Harish Mohan Srinivas Kiran Gopal Ashok Sachin Nitin Dinesh Venkat Imran'),
    F: w('Priya Anita Sunita Kavita Lakshmi Meena Pooja Neha Divya Anjali Sita Radha Shanti Geeta Sneha Aarti Rekha Swati Padma Savitri Uma Latha Nisha Shreya Asha Kamala Jyoti Manju Revathi Fatima Sunanda'),
    S: w('Sharma Patel Singh Kumar Gupta Reddy Iyer Nair Das Yadav Verma Joshi Mehta Rao Chatterjee Banerjee Khan Pillai Naidu Mishra Agarwal Bose Menon Desai Kapoor Chopra Jain Shetty Kulkarni Ansari'),
  },
  pk: {
    order: 'given',
    M: w('Muhammad Ali Ahmed Hassan Usman Bilal Imran Faisal Kamran Tariq Zahid Asif Naveed Shahid Rashid Salman Irfan Farhan Hamza Junaid Waqas Adnan Saeed Nadeem Yasir Zubair Khalid Rizwan Abdul Omar'),
    F: w('Ayesha Fatima Zainab Maryam Sana Hina Bushra Amna Nadia Saima Rukhsana Shazia Farida Noreen Samina Khadija Sadia Nazia Rabia Mehwish Iqra Uzma Humaira Tahira Shabana Asma Sobia Lubna Naila Rubina'),
    S: w('Khan Ahmed Malik Hussain Sheikh Butt Raza Chaudhry Qureshi Siddiqui Mirza Baig Ansari Abbasi Awan Bhatti Gill Javed Shah Rehman Iqbal Mahmood Akhtar Farooqi Niazi Zaidi Rana Memon Baloch Yousafzai'),
  },
  bd: {
    order: 'given',
    M: w('Mohammad Abdul Rahim Karim Jahangir Shamim Rafiq Anwar Kamal Habib Monir Sohel Farhad Mizanur Tanvir Rubel Shahin Masud Nasir Habibur Sumon Mamun Jewel Arif Rony Hasan Alamgir Biplob Sagor Shuvo Tareq'),
    F: w('Fatema Rahima Salma Nasrin Shirin Rokeya Jannat Morjina Sultana Ferdousi Taslima Shahnaz Rina Parveen Halima Rehana Mitu Sharmin Nusrat Lovely Popy Ruma Shapla Laila Moushumi Anika Tania Sumaiya Jharna Runa'),
    S: w('Islam Rahman Hossain Ahmed Khan Chowdhury Uddin Miah Sarker Talukder Siddique Akter Begum Mondal Bhuiyan Sheikh Alam Biswas Das Roy Barua Sen Paul Saha Ghosh Majumder Haque Mollah Sultana Karim'),
  },
  lk: {
    order: 'given',
    M: w('Nuwan Chaminda Kasun Sampath Lasantha Ruwan Dinesh Pradeep Tharindu Asanka Janaka Mahesh Saman Thilina Roshan Chathura Buddhika Nimal Sunil Kamal Anura Ranjith Upul Prasanna Isuru Dilshan Lahiru Hasitha Gayan Ajith Charith'),
    F: w('Nilmini Kumari Sandya Chamari Dilani Nadeeka Samanthi Anoma Sunethra Priyanka Malkanthi Shiromi Iresha Gayani Hasini Thilini Manel Sirima Kusum Lakmali Nirmala Dulani Sachini Ishara Rasika Piyumi Sanduni Menaka Amali Chathuri'),
    S: w('Perera Fernando Silva De_Silva Jayasinghe Wickramasinghe Gunawardena Bandara Rajapaksa Weerasinghe Herath Karunaratne Dissanayake Senanayake Ratnayake Samarasinghe Amarasinghe Kumara Liyanage Ranasinghe Pathirana Jayawardena Abeysekera Gamage Wijesinghe Rathnayake Seneviratne Mendis Peiris Fonseka Madushanka').map((x) => x.replace('_', ' ')),
  },
  ca: {
    order: 'given',
    M: w('Nurlan Daniyar Aibek Timur Bekzat Ruslan Azamat Farhod Rustam Jasur Sardor Bobur Dilshod Eldar Kanat Marat Askar Erlan Baurzhan Samat Ulugbek Otabek Anvar Zafar Nodir Rahmon Shavkat Murat Berik Kairat'),
    F: w('Aigerim Dana Madina Aliya Gulnara Zarina Dilnoza Malika Nargiza Feruza Shahnoza Gulmira Saule Zhanna Aida Assel Kamila Nilufar Sevara Lola Mohira Munira Guzal Aynur Ayzada Nurgul Zamira Altynai Meruert Bibigul'),
    S: w('Nurmukhamedov Karimov Rakhimov Aliyev Ismailov Tursunov Abdullaev Sultanov Kasymov Dzhumabaev Bekov Omarov Saidov Yusupov Rahmonov Ahmedov Kurbanov Mamedov Nazarov Satybaldiev Orazov Beisenov Zhakupov Toktarov Mirzaev Hasanov Usmonov Berdiev Ergashev Kadyrov Sadykov'),
  },
  // ---------------- Middle East / North Africa ----------------
  ar: {
    order: 'given',
    M: w('Mohammed Ahmed Omar Khalid Youssef Hassan Ali Ibrahim Mahmoud Mustafa Abdullah Karim Tariq Samir Nasser Hamza Walid Fadi Rami Ziad Salim Jamal Amir Bilal Sami Hisham Majid Adel Faisal Anas'),
    F: w('Fatima Aisha Mariam Layla Nour Salma Zeinab Hana Amira Rania Samira Dalia Huda Yasmin Noura Sara Leila Khadija Hiba Reem Manal Dina Nadia Lina Rasha Souad Amal Ines Farah Mona'),
    S: w('Al-Hassan Haddad Mansour Khalil Nasser Saleh Farouk Aziz Rahman Najjar Darwish Ibrahim Said Bakr Qasim Jaber Suleiman Hamdan Tahan Idris Zahra Nouri Rashid Habib Othman Salem Hijazi Mahdi Karam Shami'),
  },
  fa: {
    order: 'given',
    M: w('Mohammad Ali Reza Hossein Mehdi Amir Hamid Saeed Majid Kaveh Arash Babak Farhad Behnam Payam Navid Siavash Dariush Kourosh Mostafa Ehsan Omid Pouya Shahram Masoud Parviz Iman Farid Sina Ramin'),
    F: w('Fatemeh Zahra Maryam Narges Leila Shirin Parisa Mina Roya Sara Samira Neda Azadeh Nasrin Mahsa Elham Golnaz Shadi Sepideh Niloufar Forough Taraneh Yasaman Atefeh Maedeh Mojgan Pegah Setareh Hengameh Sima'),
    S: w('Hosseini Mohammadi Ahmadi Rezaei Karimi Moradi Jafari Hashemi Rahimi Mousavi Sadeghi Ghorbani Abbasi Najafi Kazemi Ebrahimi Yazdani Tehrani Shirazi Esfahani Tabrizi Farahani Soltani Mahdavi Bagheri Nouri Zand Pahlavan Khosravi Amini'),
  },
  tr: {
    order: 'given',
    M: w('Mehmet Mustafa Ahmet Ali Hasan Hüseyin Emre Burak Murat Can Cem Kemal Okan Serkan Volkan Onur Tolga Yusuf Ömer Kaan Barış Eren Deniz Selim Orhan Ismail Fatih Ercan Umut Berk'),
    F: w('Ayşe Fatma Emine Zeynep Elif Hatice Merve Esra Selin Derya Gül Sevgi Yasemin Büşra Ebru Cansu Ceren Pınar Sibel Burcu Nur Gamze Leyla Aylin Dilek Hülya Songül Tuba Nilay Melek'),
    S: w('Yılmaz Kaya Demir Şahin Çelik Yıldız Yıldırım Öztürk Aydın Özdemir Arslan Doğan Kılıç Aslan Çetin Kara Koç Kurt Özkan Şimşek Polat Korkmaz Erdoğan Güneş Aksoy Tekin Avcı Türk Bulut Acar'),
  },
  he: {
    order: 'given',
    M: w('David Daniel Yossi Moshe Avi Itai Noam Eitan Omer Yonatan Amir Gal Ori Tomer Nir Shlomo Eli Uri Ariel Ran Lior Yaron Doron Oren Rotem Shai Guy Asaf Ido Elad'),
    F: w('Noa Maya Tamar Shira Yael Michal Rachel Sarah Talia Dana Orly Hila Adi Liat Roni Naama Merav Keren Efrat Ayelet Tali Sivan Inbal Galit Lihi Rina Einat Yarden Moran Vered'),
    S: w('Cohen Levi Mizrahi Peretz Biton Dahan Avraham Friedman Katz Azoulay Shapira Goldberg Malka Amar Ben-David Segal Barak Golan Ohana Stern Rosen Weiss Haim Klein Sasson Bar Shalom Gabay Nahum Peled'),
  },
  // ---------------- Sub-Saharan Africa ----------------
  af_w: {
    order: 'given',
    M: w('Emeka Chinedu Olumide Tunde Ibrahim Musa Kwame Kofi Yaw Kwesi Ousmane Mamadou Abdoulaye Seydou Ibrahima Chukwu Segun Femi Adebayo Oluwaseun Sekou Moussa Amadou Issa Kojo Nana Babatunde Ifeanyi Bashir Idris Daouda'),
    F: w('Ngozi Chioma Adaeze Folake Amina Fatou Aminata Awa Mariama Adjoa Abena Akosua Efua Yetunde Bukola Funmi Nkechi Blessing Hauwa Zainab Binta Kadiatou Rokia Aissatou Mame Safiatou Ama Esi Titi Oluchi Ifeoma'),
    S: w('Okafor Adeyemi Balogun Okonkwo Mensah Boateng Owusu Asante Diallo Traore Keita Sow Ndiaye Bello Abubakar Eze Nwosu Ogunleye Ojo Adeleke Danjuma Sesay Kamara Konate Coulibaly Ouedraogo Sylla Diop Fall Appiah'),
  },
  af_e: {
    order: 'given',
    M: w('Juma Hassan Baraka Emmanuel Joseph Daniel Peter Samuel Moses David Kelvin Brian Kevin Otieno Mwangi Kamau Ochieng Tadesse Dawit Yonas Abebe Haile Getachew Mulugeta Eric Jean_Claude Patrick Innocent Alex Fred Okello').map((x) => x.replace('_', ' ')),
    F: w('Amina Mary Grace Faith Esther Joy Lucy Rose Zawadi Neema Asha Halima Wanjiru Akinyi Njeri Atieno Tigist Selam Meron Hanna Almaz Birtukan Alem Agnes Immaculate Claudine Jackline Beatrice Sarah Juliet Mercy'),
    S: w('Mwangi Otieno Kamau Ochieng Omondi Kipchoge Wanjiku Mutua Njoroge Kiprono Mushi Mrema Massawe Kimaro Mbwambo Mugisha Okello Byaruhanga Tumusiime Nakato Tesfaye Bekele Alemu Gebre Kebede Mekonnen Habimana Uwimana Ndayisaba Nsengiyumva'),
  },
  af_s: {
    order: 'given',
    M: w('Thabo Sipho Themba Bongani Lungile Mandla Sibusiso Siyabonga Tendai Tatenda Farai Blessing Kudzai Chanda Mwila Kondwani Chikondi Tshepo Kabelo Lerato Neo Thulani Nkosana Vusi Mpho Kagiso Tapiwa Rudo Peter Joseph'),
    F: w('Nomsa Thandiwe Zanele Lindiwe Nokuthula Precious Gift Rutendo Tendai Chipo Tariro Nyasha Memory Mercy Mulenga Bupe Chanda Naledi Lerato Palesa Dineo Neo Thandeka Busisiwe Ntombi Refilwe Mpho Tshepiso Anele Ayanda'),
    S: w('Nkosi Dlamini Zulu Ndlovu Khumalo Mokoena Molefe Sithole Mahlangu Moyo Sibanda Ncube Mutasa Chikwanha Banda Phiri Mwale Tembo Zimba Phiri Kgosi Modise Tau Mabaso Ngcobo Mthembu Cele Radebe Naidoo Pretorius'),
  },
  af_c: {
    order: 'given',
    M: w('Jean Patrick Joseph Pierre Christian Emmanuel Serge Didier Alain Guy Eric Rodrigue Fabrice Blaise Parfait Prosper Désiré Mamadou Cédric Hervé Landry Jonathan Gaston Ghislain Bienvenu Kevin Jules Aimé Fidèle Trésor'),
    F: w('Marie Grace Espérance Jeanne Béatrice Solange Clarisse Ghislaine Bernadette Chantal Pauline Christelle Nadège Nicole Rose Sylvie Fatou Blandine Francine Mireille Prisca Divine Joëlle Flora Annie Estelle Laetitia Carine Yvette Rachel'),
    S: w('Mbala Kabila Tshisekedi Mukendi Kasongo Ilunga Mwamba Kalala Ngoy Lukusa Nkulu Mutombo Ndongo Ekambi Mbarga Onana Etoundi Fouda Nguema Obiang Ondo Bongo Mabiala Ngoma Sassou Nzambi Mavungu Kimbangu Moukala Tchicaya'),
  },
  // ---------------- Europe & Europe-descended ----------------
  en: {
    order: 'given',
    M: w('James John Michael David Robert William Thomas Daniel Matthew Andrew Christopher Joseph Ryan Joshua Nathan Samuel Benjamin Jack Oliver Harry George Charlie Henry Liam Ethan Mason Logan Lucas Noah Connor'),
    F: w('Mary Patricia Jennifer Linda Elizabeth Susan Jessica Sarah Karen Emily Olivia Emma Charlotte Amelia Sophie Grace Hannah Megan Rachel Laura Anna Chloe Lily Ella Ruby Isla Zoe Abigail Natalie Claire'),
    S: w('Smith Johnson Williams Brown Jones Miller Davis Wilson Taylor Anderson Thomas Moore Martin Jackson Thompson White Harris Clark Lewis Robinson Walker Young Allen King Wright Scott Green Baker Adams Nelson Hill'),
  },
  de: {
    order: 'given',
    M: w('Lukas Jonas Felix Leon Maximilian Paul Niklas Tobias Stefan Thomas Michael Andreas Jan Peter Klaus Hans Jürgen Markus Florian Sebastian Daniel Matthias Christian Wolfgang Dieter Frank Bernd Uwe Dirk Sven Martijn'),
    F: w('Anna Lena Mia Hannah Sophie Laura Julia Katharina Sabine Petra Monika Ursula Claudia Andrea Birgit Heike Susanne Christine Nicole Stefanie Jana Lisa Marie Charlotte Greta Ingrid Helga Renate Gisela Eva Femke'),
    S: w('Müller Schmidt Schneider Fischer Weber Meyer Wagner Becker Schulz Hoffmann Schäfer Koch Bauer Richter Klein Wolf Schröder Neumann Schwarz Zimmermann Braun Krüger Hofmann Hartmann Lange Schmitt Werner Krause Meier de_Vries Jansen').map((x) => x.replace('_', ' ')),
  },
  fr: {
    order: 'given',
    M: w('Jean Pierre Michel Philippe Alain Louis Nicolas Julien Thomas Antoine Lucas Hugo Gabriel Maxime Mathieu Olivier Laurent Stéphane Guillaume Sébastien François Étienne Bastien Romain Clément Théo Arnaud Baptiste Yann Rémi'),
    F: w('Marie Camille Léa Chloé Manon Emma Julie Sophie Isabelle Nathalie Catherine Sylvie Valérie Céline Aurélie Claire Élodie Laure Margaux Océane Inès Juliette Charlotte Mélanie Anaïs Pauline Amélie Delphine Hélène Agnès'),
    S: w('Martin Bernard Dubois Thomas Robert Richard Petit Durand Leroy Moreau Simon Laurent Lefebvre Michel Garcia David Bertrand Roux Vincent Fournier Morel Girard André Lefèvre Mercier Dupont Lambert Bonnet François Martinez'),
  },
  es: {
    order: 'given',
    M: w('José Juan Carlos Luis Miguel Jorge Pedro Antonio Manuel Francisco Javier Diego Alejandro Andrés Sergio Daniel Fernando Ricardo Rafael Pablo Hugo Mateo Santiago Sebastián Emiliano Gustavo Ernesto Rodrigo Álvaro Iván Óscar'),
    F: w('María Carmen Ana Laura Isabel Lucía Sofía Valentina Camila Daniela Paula Marta Elena Rosa Teresa Pilar Gabriela Fernanda Andrea Carolina Natalia Patricia Claudia Lorena Mariana Alejandra Rocío Verónica Beatriz Silvia'),
    S: w('García Rodríguez González Fernández López Martínez Sánchez Pérez Gómez Martín Jiménez Ruiz Hernández Díaz Moreno Álvarez Muñoz Romero Alonso Gutiérrez Navarro Torres Domínguez Vázquez Ramos Gil Ramírez Serrano Blanco Castro Ortega'),
  },
  pt: {
    order: 'given',
    M: w('João José António Manuel Francisco Carlos Paulo Pedro Rui Miguel Luís Tiago Rafael Gabriel Lucas Mateus Gustavo Felipe Bruno Diogo Ricardo Fernando Marcelo Rodrigo Thiago Leonardo Eduardo Vinícius André Henrique Márcio'),
    F: w('Maria Ana Beatriz Inês Mariana Sofia Catarina Joana Rita Teresa Fernanda Juliana Camila Larissa Letícia Amanda Bruna Aline Patrícia Vanessa Carla Luciana Paula Sandra Cristina Helena Isabel Daniela Raquel Eduarda'),
    S: w('Silva Santos Ferreira Pereira Oliveira Costa Rodrigues Martins Jesus Sousa Fernandes Gonçalves Gomes Lopes Marques Alves Almeida Ribeiro Pinto Carvalho Teixeira Moreira Correia Mendes Nunes Soares Vieira Monteiro Cardoso Rocha Lima'),
  },
  it: {
    order: 'given',
    M: w('Giuseppe Giovanni Antonio Marco Luca Francesco Alessandro Andrea Matteo Lorenzo Davide Simone Stefano Paolo Roberto Salvatore Vincenzo Riccardo Federico Gabriele Fabio Massimo Claudio Enrico Pietro Daniele Nicola Carlo Emanuele Tommaso'),
    F: w('Maria Anna Giulia Francesca Chiara Sara Martina Valentina Elena Laura Paola Silvia Alessia Elisa Federica Roberta Simona Monica Daniela Cristina Angela Rosa Lucia Teresa Giorgia Serena Ilaria Beatrice Caterina Antonella'),
    S: w('Rossi Russo Ferrari Esposito Bianchi Romano Colombo Ricci Marino Greco Bruno Gallo Conti De_Luca Mancini Costa Giordano Rizzo Lombardi Moretti Barbieri Fontana Santoro Mariani Rinaldi Caruso Ferrara Galli Martini Leone').map((x) => x.replace('_', ' ')),
  },
  nord: {
    order: 'given',
    M: w('Erik Lars Anders Johan Karl Nils Olof Sven Magnus Henrik Mikael Jonas Oskar Emil Axel William Mattias Bjørn Søren Mads Jens Lasse Ole Kristian Mikko Juhani Matti Timo Jari Kalle Ville'),
    F: w('Anna Maria Eva Karin Ingrid Astrid Sofia Emma Linnea Elin Hanna Sara Kristina Lena Maja Freja Ida Signe Camilla Mette Sofie Liv Helene Aino Helmi Marja Johanna Tuula Pirjo Elsa Saga'),
    S: w('Johansson Andersson Karlsson Nilsson Eriksson Larsson Olsson Persson Svensson Gustafsson Hansen Nielsen Jensen Pedersen Andersen Larsen Olsen Berg Lindberg Halvorsen Korhonen Virtanen Mäkinen Nieminen Heikkinen Lahtinen Hakala Salminen Lund Dahl'),
  },
  ru: {
    order: 'given',
    M: w('Alexander Dmitry Sergey Andrey Alexey Maxim Ivan Mikhail Nikolai Vladimir Pavel Yuri Igor Oleg Viktor Anton Artem Roman Denis Konstantin Evgeny Vasily Boris Anatoly Grigory Stanislav Ruslan Timofey Kirill Yaroslav'),
    F: w('Anastasia Maria Olga Elena Natalia Tatiana Irina Svetlana Ekaterina Anna Yulia Daria Polina Victoria Oksana Galina Lyudmila Nadezhda Valentina Alina Ksenia Sofia Vera Marina Yana Larisa Kristina Alexandra Tamara Zoya'),
    S: w('Ivanov|Ivanova Petrov|Petrova Sidorov|Sidorova Smirnov|Smirnova Kuznetsov|Kuznetsova Popov|Popova Volkov|Volkova Sokolov|Sokolova Lebedev|Lebedeva Kozlov|Kozlova Novikov|Novikova Morozov|Morozova Pavlov|Pavlova Orlov|Orlova Fedorov|Fedorova Mikhailov|Mikhailova Belov|Belova Tarasov|Tarasova Zaitsev|Zaitseva Kovalenko|Kovalenko Shevchenko|Shevchenko Bondarenko|Bondarenko Melnik|Melnik Tkachenko|Tkachenko Kravchenko|Kravchenko Boyko|Boyko Lysenko|Lysenko Moroz|Moroz Vasiliev|Vasilieva Egorov|Egorova Nikitin|Nikitina Frolov|Frolova'),
  },
  cee: {
    order: 'given',
    M: w('Jan Piotr Tomasz Marek Paweł Krzysztof Michał Jakub Martin Petr Pavel Jiří Tomáš Lukáš Péter László István Gábor Zoltán Andrei Ion Mihai Alexandru Marko Nikola Stefan Ivan Dragan Miroslav Aleksandar'),
    F: w('Anna Katarzyna Magdalena Agnieszka Zofia Eva Jana Lucie Petra Tereza Katalin Judit Zsuzsa Éva Ildikó Elena Maria Ioana Andreea Ana Marija Jelena Milica Ivana Snežana Biljana Dragana Vesna Tanja Mirjana'),
    S: w('Nowak|Nowak Kowalski|Kowalska Wiśniewski|Wiśniewska Novák|Nováková Svoboda|Svobodová Dvořák|Dvořáková Horváth|Horváth Kovács|Kovács Nagy|Nagy Szabó|Szabó Popescu|Popescu Ionescu|Ionescu Marin|Marin Petrović|Petrović Jovanović|Jovanović Nikolić|Nikolić Kovačević|Kovačević Horvat|Horvat Babić|Babić Novak|Novak Kralj|Kralj Hadžić|Hadžić Dimitrov|Dimitrov Georgiev|Georgieva Kaminski|Kamińska Zielinski|Zielińska Procházka|Procházková Černý|Černá Varga|Varga Lazar|Lazar'),
  },
  el: {
    order: 'given',
    M: w('Giorgos Dimitris Nikos Giannis Kostas Panagiotis Christos Vasilis Thanasis Manolis Stavros Alexandros Spyros Michalis Antonis Petros Andreas Yiannis Lefteris Haris Takis Sotiris Apostolos Kyriakos Pavlos Argyris Fotis Stelios Tasos Marios'),
    F: w('Maria Eleni Katerina Georgia Sofia Anna Dimitra Vasiliki Ioanna Christina Evangelia Despina Angeliki Konstantina Athina Zoi Irini Paraskevi Aikaterini Efi Natasa Eirini Marina Theodora Voula Stavroula Lina Foteini Panagiota Ourania'),
    S: w('Papadopoulos Georgiou Nikolaou Dimitriou Papadakis Vasileiou Ioannou Karagiannis Pappas Konstantinou Oikonomou Alexiou Michailidis Antoniou Makris Angelopoulos Theodorou Christodoulou Kyriakou Anastasiou Petrou Stavrou Athanasiou Lazaridis Papanikolaou Vlachos Zografos Manolis Galanis Economou'),
  },
  cauc: {
    order: 'given',
    M: w('Giorgi Davit Levan Nika Irakli Zurab Tornike Lasha Mamuka Gela Tengiz Aram Armen Artur Gor Hayk Narek Vahe Karen Tigran Samvel Levon Garik Hovhannes Arman Ashot Sargis Vardan Gevorg Mher'),
    F: w('Nino Mariam Ana Tamar Salome Natia Ketevan Nana Eka Lali Maia Tea Elene Anahit Lusine Narine Mane Hasmik Satenik Armine Gayane Lilit Mariam Siranush Astghik Anush Tatev Nare Zaruhi Meline'),
    S: w('Beridze Kapanadze Gelashvili Maisuradze Lomidze Giorgadze Mamedov Chkheidze Kvaratskhelia Tsiklauri Janelidze Abashidze Bagrationi Gogiashvili Khachidze Petrosyan Hovhannisyan Grigoryan Sargsyan Harutyunyan Avetisyan Mkrtchyan Karapetyan Vardanyan Poghosyan Gevorgyan Hakobyan Ghazaryan Melkonyan Danielyan'),
  },
};

// ---- Country -> pool mapping -------------------------------------------------------------------

const BY_COUNTRY = {
  CHN: 'zh', TWN: 'zh', HKG: 'zh', MAC: 'zh', SGP: 'zh', MNG: 'ca', JPN: 'ja', KOR: 'ko', PRK: 'ko',
  VNM: 'vi', THA: 'th', IDN: 'id', MYS: 'id', PHL: 'ph', MMR: 'mm', KHM: 'km', LAO: 'km', TLS: 'pt',
  IND: 'in', PAK: 'pk', AFG: 'pk', BGD: 'bd', LKA: 'lk', NPL: 'lk', BTN: 'lk', MDV: 'pk',
  KAZ: 'ca', UZB: 'ca', TKM: 'ca', TJK: 'ca', KGZ: 'ca', AZE: 'tr',
  IRN: 'fa', TUR: 'tr', ISR: 'he',
  SDN: 'ar', SOM: 'ar', MRT: 'ar', DJI: 'ar', COM: 'ar',
  NGA: 'af_w', GHA: 'af_w', CIV: 'af_w', SEN: 'af_w', MLI: 'af_w', BFA: 'af_w', NER: 'af_w', GIN: 'af_w', BEN: 'af_w', TGO: 'af_w', SLE: 'af_w', LBR: 'af_w', GMB: 'af_w', TCD: 'af_w',
  ETH: 'af_e', KEN: 'af_e', TZA: 'af_e', UGA: 'af_e', RWA: 'af_e', BDI: 'af_e', ERI: 'af_e', SSD: 'af_e', MDG: 'af_e',
  ZAF: 'af_s', ZWE: 'af_s', MWI: 'af_s', ZMB: 'af_s', BWA: 'af_s', NAM: 'af_s', LSO: 'af_s', SWZ: 'af_s',
  COD: 'af_c', CMR: 'af_c', CAF: 'af_c', COG: 'af_c', GAB: 'af_c', GNQ: 'es',
  MOZ: 'pt', AGO: 'pt', GNB: 'pt', CPV: 'pt', MUS: 'in',
  GBR: 'en', IRL: 'en', USA: 'en', CAN: 'en', AUS: 'en', NZL: 'en', GUY: 'en', JAM: 'en', TTO: 'en', BLZ: 'en', FJI: 'in', PNG: 'en', SLB: 'en',
  DEU: 'de', AUT: 'de', CHE: 'de', NLD: 'de', LUX: 'de', BEL: 'fr', FRA: 'fr', HTI: 'fr',
  ESP: 'es', PRT: 'pt', BRA: 'pt', ITA: 'it', MLT: 'it',
  SWE: 'nord', NOR: 'nord', DNK: 'nord', FIN: 'nord', EST: 'nord', LVA: 'nord', LTU: 'nord',
  RUS: 'ru', BLR: 'ru', UKR: 'ru', MDA: 'ru',
  POL: 'cee', CZE: 'cee', SVK: 'cee', HUN: 'cee', ROU: 'cee', BGR: 'cee', SRB: 'cee', HRV: 'cee', BIH: 'cee', SVN: 'cee', MKD: 'cee', MNE: 'cee', ALB: 'cee', XKX: 'cee',
  GRC: 'el', CYP: 'el', GEO: 'cauc', ARM: 'cauc',
  SUR: 'de',
};

const REGION_DEFAULT = {
  EAS: 'zh', SEA: 'id', SAS: 'in', CAS: 'ca', MENA: 'ar', SSA: 'af_w', EUR: 'en', NAM: 'en', LAC: 'es', OCE: 'en',
};

/** Pool key for a country record ({ code, region }). */
export function poolKeyFor(country) {
  const k = BY_COUNTRY[country.code];
  return k && POOLS[k] ? k : REGION_DEFAULT[country.region];
}

export function getPool(key) {
  return POOLS[key];
}

export const POOL_KEYS = Object.keys(POOLS);

// ---- Name generation -----------------------------------------------------------------------------

function parts(token) {
  return token.split('|');
}

/**
 * Compose a display name. `rng` is a function returning [0,1). `familyOverride` forces a surname
 * token (children inheriting the father's name); returns { given, family, full, familyToken }.
 */
export function makeName(poolKey, gender, rng, familyOverride = null) {
  const pool = POOLS[poolKey] || POOLS.en;
  const givenToken = (gender === 'F' ? pool.F : pool.M)[Math.floor(rng() * (gender === 'F' ? pool.F : pool.M).length)];
  const familyToken = familyOverride || pool.S[Math.floor(rng() * pool.S.length)];
  return composeName(poolKey, gender, givenToken, familyToken);
}

/** Build the display strings from raw tokens. */
export function composeName(poolKey, gender, givenToken, familyToken) {
  const pool = POOLS[poolKey] || POOLS.en;
  let given, family, full;
  if (poolKey === 'ko') {
    const [gh, gc] = parts(givenToken), [fh, fc] = parts(familyToken);
    given = gh; family = fh;
    full = gc && gc !== gh ? `${fh}${gh}（${fc}${gc}）` : `${fh}${gh}`;
  } else if (poolKey === 'ru' || poolKey === 'cee') {
    const [m, f] = parts(familyToken);
    family = gender === 'F' ? (f || m) : m;
    given = givenToken;
    full = `${given} ${family}`;
  } else if (pool.order === 'family') {
    given = givenToken; family = familyToken;
    full = poolKey === 'vi' ? `${family} ${given}` : `${family}${given}`;
  } else {
    given = givenToken; family = familyToken; full = `${given} ${family}`;
  }
  return { given, family, full, familyToken };
}

/** Number of distinct (given, family) combinations; used by tests. */
export function poolSizes(key) {
  const p = POOLS[key];
  return { M: p.M.length, F: p.F.length, S: p.S.length };
}
