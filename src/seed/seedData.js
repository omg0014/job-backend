/**
 * Sample data for the development seed. Kept separate from the seed runner so
 * the shapes are easy to scan and extend.
 */

const daysFromNow = (days) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(23, 59, 59, 0);
  return date;
};

export const jobs = [
  {
    title: 'PGT Physics',
    department: 'Senior Secondary',
    location: 'Coimbatore, Tamil Nadu',
    employmentType: 'full_time',
    experienceMin: 3,
    experienceMax: 10,
    qualification: 'M.Sc. Physics with B.Ed',
    skills: ['Lesson Planning', 'Laboratory Management', 'CBSE Curriculum', 'Student Assessment'],
    subjects: ['Physics'],
    openings: 2,
    lastDateToApply: daysFromNow(30),
    status: 'open',
    description: `Yugam International School is looking for a Post Graduate Teacher of Physics for classes XI and XII.

Responsibilities
- Deliver the CBSE Physics curriculum for the senior secondary section
- Plan and supervise laboratory practicals and maintain lab safety standards
- Prepare students for board examinations and competitive entrance tests
- Track individual student progress and communicate it to parents each term

Requirements
- M.Sc. in Physics with B.Ed from a recognised university
- At least 3 years of senior secondary teaching experience
- Comfortable with smart classroom technology`,
  },
  {
    title: 'TGT Mathematics',
    department: 'Middle School',
    location: 'Coimbatore, Tamil Nadu',
    employmentType: 'full_time',
    experienceMin: 2,
    experienceMax: 8,
    qualification: 'B.Sc. Mathematics with B.Ed, CTET qualified',
    skills: ['Classroom Management', 'Lesson Planning', 'Student Assessment', 'Smart Board'],
    subjects: ['Mathematics'],
    openings: 1,
    lastDateToApply: daysFromNow(21),
    status: 'open',
    description: `A Trained Graduate Teacher of Mathematics is required for classes VI to X.

Responsibilities
- Teach Mathematics across the middle school section
- Build conceptual understanding through activity-based learning
- Run remedial sessions for students who need additional support
- Contribute to the annual Mathematics olympiad and club activities

Requirements
- B.Sc. Mathematics with B.Ed
- CTET or state TET qualification
- 2+ years of experience teaching a CBSE curriculum`,
  },
  {
    title: 'Primary Teacher (Class I–V)',
    department: 'Primary',
    location: 'Coimbatore, Tamil Nadu',
    employmentType: 'full_time',
    experienceMin: 1,
    experienceMax: 6,
    qualification: 'Graduate with D.El.Ed or NTT',
    skills: ['Classroom Management', 'Parent Communication', 'Lesson Planning'],
    subjects: ['English', 'Mathematics', 'Environmental Science'],
    openings: 3,
    lastDateToApply: daysFromNow(25),
    status: 'open',
    description: `We are hiring warm, patient primary teachers for the junior wing.

Responsibilities
- Act as class teacher for a section of 25-30 young learners
- Teach English, Mathematics and EVS using activity-led methods
- Maintain daily observation records and share them with parents
- Support co-curricular activities and annual day preparation

Requirements
- Graduation in any discipline with D.El.Ed, NTT or Montessori training
- 1+ year of experience in a primary classroom
- Fluent spoken English`,
  },
  {
    title: 'Computer Science Teacher',
    department: 'Computer Science',
    location: 'Coimbatore, Tamil Nadu',
    employmentType: 'full_time',
    experienceMin: 2,
    experienceMax: 12,
    qualification: 'B.Tech / MCA / M.Sc. Computer Science with B.Ed preferred',
    skills: ['Educational Technology', 'Google Classroom', 'Curriculum Development'],
    subjects: ['Computer Science'],
    openings: 1,
    lastDateToApply: daysFromNow(40),
    status: 'open',
    description: `Teach Computer Science across the secondary and senior secondary sections.

Responsibilities
- Deliver the CBSE Computer Science syllabus including Python programming
- Manage the school computer laboratory and its software licences
- Mentor students for coding competitions and the school technology club
- Support colleagues in adopting classroom technology

Requirements
- B.Tech, MCA or M.Sc. in Computer Science
- Strong Python fundamentals
- 2+ years of teaching experience; B.Ed preferred`,
  },
  {
    title: 'Physical Education Instructor',
    department: 'Sports',
    location: 'Coimbatore, Tamil Nadu',
    employmentType: 'part_time',
    experienceMin: 1,
    experienceMax: 10,
    qualification: 'B.P.Ed or M.P.Ed',
    skills: ['Extra-curricular Coordination', 'Classroom Management'],
    subjects: ['Physical Education'],
    openings: 1,
    lastDateToApply: daysFromNow(18),
    status: 'open',
    description: `A part-time Physical Education instructor is required for the afternoon games sessions.

Responsibilities
- Conduct daily games periods for classes III to VIII
- Coach the school athletics and basketball teams
- Organise the annual sports day
- Maintain sports equipment inventory

Requirements
- B.P.Ed or M.P.Ed from a recognised institution
- Experience coaching at least one team sport
- Available between 1 pm and 5 pm on weekdays`,
  },
];

export const candidates = [
  {
    user: { name: 'Anjali Menon', email: 'anjali.menon@example.com', password: 'Teacher@123' },
    profile: {
      fullName: 'Anjali Menon',
      phone: '9843210567',
      email: 'anjali.menon@example.com',
      location: 'Coimbatore',
      headline: 'PGT Physics with 7 years of CBSE senior secondary experience',
      totalExperienceYears: 7,
      education: [
        {
          degree: 'M.Sc.',
          specialization: 'Physics',
          institution: 'Bharathiar University',
          boardOrUniversity: 'Bharathiar University',
          yearOfPassing: '2016',
          percentageOrCgpa: '8.4',
        },
        {
          degree: 'B.Ed',
          specialization: 'Physical Science',
          institution: 'PSG College of Education',
          boardOrUniversity: 'Tamil Nadu Teachers Education University',
          yearOfPassing: '2017',
          percentageOrCgpa: '82',
        },
      ],
      experience: [
        {
          designation: 'PGT Physics',
          organization: 'Sri Vidya Mandir Senior Secondary School',
          subjectsTaught: ['Physics'],
          startDate: '2019',
          endDate: '',
          isCurrent: true,
          description:
            'Teaching Physics to classes XI and XII, managing the senior physics laboratory and preparing students for board and JEE examinations.',
        },
        {
          designation: 'TGT Science',
          organization: 'Kovai Public School',
          subjectsTaught: ['Physics', 'Chemistry'],
          startDate: '2017',
          endDate: '2019',
          isCurrent: false,
          description: 'Taught integrated science to classes VIII to X.',
        },
      ],
      subjects: ['Physics'],
      skills: ['Lesson Planning', 'Laboratory Management', 'CBSE Curriculum', 'Smart Board'],
      certifications: ['M.Sc.', 'B.Ed', 'CTET'],
      languages: ['English', 'Tamil', 'Malayalam'],
      preferredDepartments: ['Senior Secondary', 'Science'],
    },
  },
  {
    user: { name: 'Rahul Verma', email: 'rahul.verma@example.com', password: 'Teacher@123' },
    profile: {
      fullName: 'Rahul Verma',
      phone: '9822104466',
      email: 'rahul.verma@example.com',
      location: 'Chennai',
      headline: 'TGT Mathematics, CTET qualified, 4 years in CBSE middle school',
      totalExperienceYears: 4,
      education: [
        {
          degree: 'B.Sc.',
          specialization: 'Mathematics',
          institution: 'Loyola College',
          boardOrUniversity: 'University of Madras',
          yearOfPassing: '2018',
          percentageOrCgpa: '76',
        },
        {
          degree: 'B.Ed',
          specialization: 'Mathematics',
          institution: 'Meston College of Education',
          boardOrUniversity: 'TNTEU',
          yearOfPassing: '2020',
          percentageOrCgpa: '79',
        },
      ],
      experience: [
        {
          designation: 'TGT Mathematics',
          organization: 'Chennai Modern School',
          subjectsTaught: ['Mathematics'],
          startDate: '2020',
          endDate: '',
          isCurrent: true,
          description:
            'Teaching Mathematics to classes VI to X with an emphasis on activity-based conceptual learning. Runs the school Mathematics club.',
        },
      ],
      subjects: ['Mathematics'],
      skills: ['Classroom Management', 'Lesson Planning', 'Student Assessment'],
      certifications: ['B.Sc.', 'B.Ed', 'CTET'],
      languages: ['English', 'Hindi', 'Tamil'],
      preferredDepartments: ['Middle School', 'Mathematics'],
    },
  },
  {
    user: { name: 'Fatima Sheikh', email: 'fatima.sheikh@example.com', password: 'Teacher@123' },
    profile: {
      fullName: 'Fatima Sheikh',
      phone: '9700456123',
      email: 'fatima.sheikh@example.com',
      location: 'Coimbatore',
      headline: 'Primary teacher with Montessori training and 3 years of experience',
      totalExperienceYears: 3,
      education: [
        {
          degree: 'B.A.',
          specialization: 'English Literature',
          institution: 'Avinashilingam University',
          boardOrUniversity: 'Avinashilingam University',
          yearOfPassing: '2019',
          percentageOrCgpa: '71',
        },
        {
          degree: 'Montessori',
          specialization: 'Early Childhood Education',
          institution: 'Indian Montessori Centre',
          boardOrUniversity: 'IMC',
          yearOfPassing: '2020',
          percentageOrCgpa: 'A',
        },
      ],
      experience: [
        {
          designation: 'Primary Teacher',
          organization: 'Little Scholars Matriculation School',
          subjectsTaught: ['English', 'Environmental Science'],
          startDate: '2021',
          endDate: '',
          isCurrent: true,
          description:
            'Class teacher for grade III. Teaches English and EVS, maintains daily observation records and leads parent communication.',
        },
      ],
      subjects: ['English', 'Environmental Science'],
      skills: ['Classroom Management', 'Parent Communication', 'Lesson Planning'],
      certifications: ['B.A.', 'Montessori'],
      languages: ['English', 'Tamil', 'Urdu', 'Hindi'],
      preferredDepartments: ['Primary'],
    },
  },
  {
    user: { name: 'Karthik Subramanian', email: 'karthik.s@example.com', password: 'Teacher@123' },
    profile: {
      fullName: 'Karthik Subramanian',
      phone: '9789012345',
      email: 'karthik.s@example.com',
      location: 'Coimbatore',
      headline: 'Computer Science teacher and coding club mentor, 5 years CBSE',
      totalExperienceYears: 5,
      education: [
        {
          degree: 'B.Tech',
          specialization: 'Computer Science',
          institution: 'PSG College of Technology',
          boardOrUniversity: 'Anna University',
          yearOfPassing: '2018',
          percentageOrCgpa: '8.1',
        },
        {
          degree: 'B.Ed',
          specialization: 'Computer Science',
          institution: 'Sri Ramakrishna College of Education',
          boardOrUniversity: 'TNTEU',
          yearOfPassing: '2020',
          percentageOrCgpa: '80',
        },
      ],
      experience: [
        {
          designation: 'Computer Science Teacher',
          organization: 'Bharathi Vidya Bhavan',
          subjectsTaught: ['Computer Science'],
          startDate: '2020',
          endDate: '',
          isCurrent: true,
          description:
            'Teaches Python and the CBSE Computer Science syllabus to classes XI and XII. Runs the school coding club and mentors teams for state-level competitions.',
        },
      ],
      subjects: ['Computer Science'],
      skills: ['Educational Technology', 'Google Classroom', 'Curriculum Development'],
      certifications: ['B.Tech', 'B.Ed'],
      languages: ['English', 'Tamil'],
      preferredDepartments: ['Computer Science', 'Senior Secondary'],
    },
  },
  {
    user: { name: 'Priya Nair', email: 'priya.nair@example.com', password: 'Teacher@123' },
    profile: {
      fullName: 'Priya Nair',
      phone: '9843567812',
      email: 'priya.nair@example.com',
      location: 'Coimbatore',
      headline: 'Physical education teacher and state-level basketball coach',
      totalExperienceYears: 6,
      education: [
        {
          degree: 'M.P.Ed',
          specialization: 'Physical Education',
          institution: 'YMCA College of Physical Education',
          boardOrUniversity: 'University of Madras',
          yearOfPassing: '2019',
          percentageOrCgpa: '77',
        },
      ],
      experience: [
        {
          designation: 'Physical Education Instructor',
          organization: 'Nirmala Matriculation School',
          subjectsTaught: ['Physical Education'],
          startDate: '2019',
          endDate: '',
          isCurrent: true,
          description:
            'Runs daily games periods for classes III to X, coaches the school basketball and athletics teams, and organises the annual sports day.',
        },
      ],
      subjects: ['Physical Education'],
      skills: ['Extra-curricular Coordination', 'Classroom Management'],
      certifications: ['M.P.Ed'],
      languages: ['English', 'Malayalam', 'Tamil'],
      preferredDepartments: ['Sports'],
    },
  },
  {
    user: { name: 'Sneha Deshpande', email: 'sneha.d@example.com', password: 'Teacher@123' },
    profile: {
      fullName: 'Sneha Deshpande',
      phone: '9822345671',
      email: 'sneha.d@example.com',
      location: 'Pune',
      headline: 'B.Ed graduate seeking a first teaching role in middle school mathematics',
      totalExperienceYears: 0,
      education: [
        {
          degree: 'B.Sc.',
          specialization: 'Mathematics',
          institution: 'Fergusson College',
          boardOrUniversity: 'Savitribai Phule Pune University',
          yearOfPassing: '2023',
          percentageOrCgpa: '8.6',
        },
        {
          degree: 'B.Ed',
          specialization: 'Mathematics',
          institution: 'Tilak College of Education',
          boardOrUniversity: 'SPPU',
          yearOfPassing: '2025',
          percentageOrCgpa: '82',
        },
      ],
      experience: [
        {
          designation: 'Student Teacher',
          organization: 'Abhinav Vidyalaya',
          subjectsTaught: ['Mathematics'],
          startDate: '2024',
          endDate: '2025',
          isCurrent: false,
          description:
            'Completed a B.Ed teaching internship across classes VI to VIII, planning and delivering lessons under a mentor teacher.',
        },
      ],
      subjects: ['Mathematics'],
      skills: ['Lesson Planning', 'Student Assessment'],
      certifications: ['B.Sc.', 'B.Ed', 'CTET'],
      languages: ['English', 'Hindi', 'Marathi'],
      preferredDepartments: ['Middle School', 'Mathematics'],
    },
  },
  {
    user: { name: 'Joseph Mathew', email: 'joseph.mathew@example.com', password: 'Teacher@123' },
    profile: {
      fullName: 'Joseph Mathew',
      phone: '9745123890',
      email: 'joseph.mathew@example.com',
      location: 'Kochi',
      headline: 'Head of Science with 14 years of senior secondary teaching and CBSE examining',
      totalExperienceYears: 14,
      education: [
        {
          degree: 'M.Sc.',
          specialization: 'Chemistry',
          institution: 'St. Joseph’s College',
          boardOrUniversity: 'Mahatma Gandhi University',
          yearOfPassing: '2009',
          percentageOrCgpa: '79',
        },
        {
          degree: 'B.Ed',
          specialization: 'Physical Science',
          institution: 'St. Joseph’s College of Teacher Education',
          boardOrUniversity: 'MG University',
          yearOfPassing: '2011',
          percentageOrCgpa: '84',
        },
      ],
      experience: [
        {
          designation: 'Head of Department, Science',
          organization: 'Rajagiri Public School',
          subjectsTaught: ['Chemistry', 'Physics'],
          startDate: '2017',
          endDate: '',
          isCurrent: true,
          description:
            'Leads a department of nine science teachers, sets the departmental assessment policy, and serves as a CBSE board examiner for Chemistry.',
        },
        {
          designation: 'PGT Chemistry',
          organization: 'Bhavans Vidya Mandir',
          subjectsTaught: ['Chemistry'],
          startDate: '2011',
          endDate: '2017',
          isCurrent: false,
          description: 'Taught Chemistry to classes XI and XII and managed the senior laboratory.',
        },
      ],
      subjects: ['Chemistry', 'Physics'],
      skills: [
        'Curriculum Development',
        'Laboratory Management',
        'Student Assessment',
        'CBSE Curriculum',
      ],
      certifications: ['M.Sc.', 'B.Ed', 'NET'],
      languages: ['English', 'Malayalam', 'Hindi'],
      preferredDepartments: ['Senior Secondary', 'Science'],
    },
  },
  {
    /**
     * Registered but never applied — index 7, deliberately absent from the
     * application pairings in seed.js.
     *
     * This is the case the Candidates directory exists for: a teacher who
     * signed up and filled in a profile but never pressed Apply. Without one
     * in the dataset, the "Never applied" filter and the Offer a role flow
     * can only be tested against an empty list.
     */
    user: { name: 'Ritu Chaudhary', email: 'ritu.chaudhary@example.com', password: 'Teacher@123' },
    profile: {
      fullName: 'Ritu Chaudhary',
      phone: '9811234567',
      email: 'ritu.chaudhary@example.com',
      location: 'New Delhi',
      headline: 'TGT Social Science with 8 years of CBSE middle school experience',
      totalExperienceYears: 8,
      education: [
        {
          degree: 'M.A.',
          specialization: 'History',
          institution: 'Lady Shri Ram College',
          boardOrUniversity: 'University of Delhi',
          yearOfPassing: '2015',
          percentageOrCgpa: '74',
        },
        {
          degree: 'B.Ed',
          specialization: 'Social Science',
          institution: 'Jamia Millia Islamia',
          boardOrUniversity: 'Jamia Millia Islamia',
          yearOfPassing: '2016',
          percentageOrCgpa: '81',
        },
      ],
      experience: [
        {
          designation: 'TGT Social Science',
          organization: 'Delhi Public School, Vasant Kunj',
          subjectsTaught: ['Social Science', 'History'],
          startDate: '2017',
          endDate: '',
          isCurrent: true,
          description:
            'Teaches History and Civics to classes VI to X, coordinates the annual heritage walk, and mentors the student parliament.',
        },
      ],
      subjects: ['Social Science', 'History'],
      skills: ['Lesson Planning', 'Classroom Management', 'Student Assessment'],
      certifications: ['M.A.', 'B.Ed', 'CTET'],
      languages: ['English', 'Hindi'],
      preferredDepartments: ['Middle School', 'Humanities'],
    },
  },
];
