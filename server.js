const express = require("express");
const app = express();
const path = require("path");
const mysql = require("mysql2");
const http = require("http").Server(app);
const multer = require("multer");
const io = require("socket.io")(http);
const fs = require("fs");
const port = process.env.PORT || 3000;


app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "src")));

// Configure MySQL connection
const db = mysql.createConnection({
  host: "127.0.0.1",
  user: "root",
  password: "080080800",
  database: "docstatuscredentials",
});
db.connect((err) => {
  if (err) {
    console.error("Error connecting to MySQL:", err);
    return;
  }
  console.log("Connected to MySQL");
});
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    let uploadDir;

    if (req.body.userType === "doctor") {
      uploadDir = "src/profilepics/doctorprofilepics";
    } else if (req.body.userType === "user") {
      uploadDir = "src/profilepics/userprofilepics";
    } else {
    }

    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    cb(null, req.body.username + path.extname(file.originalname));
  },
});
const upload = multer({ storage: storage });

//sending hospital data
app.get("/hospitalsData", async (req, res) => {
  try {
    const query = "SELECT * FROM hospitals";
    const [result] = await db.promise().query(query);

    // Send the data as JSON
    res.json(result);
  } catch (error) {
    console.error("Error fetching hospitals:", error);
    res.status(500).send("Internal Server Error");
  }
});

app.get("/fetchDoctorData", async (req, res) => {
  try {
    console.log("fetchdoctor hospital name  :", req.query.hospital);
    if (req.query.hospital) {
      const query = `
      SELECT *
      FROM doctors
      WHERE 
        LOWER(affiliatedhospitals) LIKE LOWER(?)
        OR LOWER(currentlyavailablehospoital) LIKE LOWER(?);
    `;

      const hospitalSearchString = `%${req.query.hospital}%`;

      const [result] = await db
        .promise()
        .query(query, [hospitalSearchString, hospitalSearchString]);

      res.json(result);
    } else {
      const query = `SELECT * FROM doctors`;
      const [result] = await db.promise().query(query);
      res.json(result);
    }
  } catch (error) {
    console.error("Error fetching doctors:", error);
    res.status(500).send("Internal Server Error");
  }
});

//updating profile pictures

app.post("/profilePicture", upload.single("profilePic"), async (req, res) => {
  if (!req.file) {
    return res.status(400).send("No file found");
  }

  const imagePath = path.join(req.file.destination, req.file.filename);
  const username = req.body.username;

  updateProfilePicDatabase(req.body, username, imagePath);

  if (req.body.userType == "doctor") {
    const Data = await bringProfileData(req.body.username, "doctors");
    const doctordata = Data[0][0];
    const redirectURL = `/doctorProfilePage.html?name=${doctordata.username}
    &field=${doctordata.field}
    &degree=${doctordata.degree}
    &speciality=${doctordata.speciality}
    &subspecial=${doctordata.subspecialization}
    &contact=${doctordata.contactnumber}
    &email=${doctordata.email}
    &affiliatedhospitals=${doctordata.affiliatedhospitals}
    &currentHospital=${doctordata.currentlyavailablehospoital}
    &availibility=${doctordata.available}
    &currentToken=${doctordata.currenttoken}
    &lastToken=${doctordata.lasttoken}
    &profilePic=${doctordata.profilepicture}`;

    res.redirect(redirectURL);
  } else {
    const data = await bringProfileData(req.body.username, "user");
    const userdata = data[0][0];
    const redirectURL = `/userProfilePage.html?username=${userdata.username}
  &contact=${userdata.contactnumber}
  &email=${userdata.email}
  &gender=${userdata.gender}
  &age=${userdata.age}
  &profilePic=${userdata.profilepicture}`;

    res.redirect(redirectURL);
  }
});

const updateProfilePicDatabase = (data, username, imagePath) => {
  // Assuming you have a 'doctors' and 'users' table
  const table = data.userType === "doctor" ? "doctors" : "user";

  const query = `UPDATE ${table} SET profilepicture = ? WHERE username = ?`;

  db.query(query, [imagePath, username], (error, result) => {
    if (error) {
      console.error("Error updating profile picture:", error);
      // Handle the error accordingly (send an error response, log, etc.)
    } else {
      console.log("Profile picture updated successfully.");
      // You might want to send a success response or perform additional actions
    }
  });
};

//userProfileEditUpdate

app.post("/updateUserProfile", async (req, res) => {
  console.log(req.body);
  await updateUserTable(req.body);

  const Data = await bringProfileData(req.body.username, "user");

  const userdata = Data[0][0];

  console.log(
    "Data bring by bring profile data after username update : ",
    userdata
  );
  const redirectURL = `/userProfilePage.html?username=${userdata.username}
    &contact=${userdata.contactnumber}
    &email=${userdata.email}
    &gender=${userdata.gender}
    &age=${userdata.age}
    &profilePic=${userdata.profilepicture}`;

  res.redirect(redirectURL);
});

function usernameAvailable(username) {
  return new Promise((resolve, reject) => {
    const query1 = `SELECT COUNT(*) AS count FROM users where username = ?`;
    db.query(query1, [username], (error, result) => {
      if (error) {
        console.log("wrong query");
        reject(error);
      } else {
        resolve(result);
      }
    });
  });
}

async function updateUserTable(data) {
  try {
    if (data.username != data.oldUsername) {
      const available = await usernameAvailable(data.username);
      console.log(
        "new and old are different and new is available : ",
        available[0].count
      );

      if (!available[0].count) {
        try {
          let query = `UPDATE users SET username = ? WHERE username = ?`;
          let result = await db
            .promise()
            .query(query, [data.username, data.oldUsername]);

          query = `UPDATE user SET username = ? WHERE username = ?`;
          result = await db
            .promise()
            .query(query, [data.username, data.oldUsername]);
        } catch (error) {
          console.error("Error updating username:", error);
          throw error;
        }
      } else {
        // Handle the case where the new username is not available
        console.log("New username is not available.");
      }
    }

    // Rest of your code for updating other fields when the username is the same
    const querynew = `
      UPDATE user
      SET contactnumber = ?,
      email = ?,
      age = ?,
      gender = ?
      WHERE username = ?`;

    // Extract values from data

    // Check for undefined values and replace them with null
    const params = [
      data.contactNumber || null,
      data.mail || null,
      data.age || null,
      data.gender || null,
      data.username || null,
    ];

    // Log the values being used in the query
    console.log("Values in updateUserTable query:", params);

    // Execute the query
    const result = await db.promise().query(querynew, params);
  } catch (error) {
    console.error("Error updating user table:", error);
    throw error;
  }
}

//DoctorProfileEditUpdata

app.post("/updateProfile", async (req, res) => {
  console.log("Sended data", req.body);
  await updateDoctorsTable(req.body);
  console.log("tables updated succesfully");
  const Data = await bringProfileData(req.body.username, "doctors");

  console.log(typeof Data);
  console.log("recieved data from bringprofiledata", Data[0][0]);

  const doctordata = Data[0][0];
  const redirectURL = `/doctorProfilePage.html?name=${doctordata.username}
  &field=${doctordata.field}
  &degree=${doctordata.degree}
  &speciality=${doctordata.speciality}
  &subspecial=${doctordata.subspecialization}
  &contact=${doctordata.contactnumber}
  &email=${doctordata.email}
  &affiliatedhospitals=${doctordata.affiliatedhospitals}
  &currentHospital=${doctordata.currentlyavailablehospoital}
  &availibility=${doctordata.available}
  &currentToken=${doctordata.currenttoken}
  &lastToken=${doctordata.lasttoken}
  &profilePic=${doctordata.profilepicture}`;

  res.redirect(redirectURL);
});
async function updateDoctorsTable(data) {
  try {
    const query = `
      UPDATE doctors
      SET field = ?,
          degree = ?,
          speciality = ?,
          subspecialization = ?,
          contactnumber = ?,
          email = ?,
          affiliatedhospitals = ?
      WHERE username = ?
    `;

    // Extract values from data
    const {
      fieldName,
      degree,
      speciality,
      subSpeciality,
      contactNumber,
      mail,
      affiliatedHospitals,
      username,
    } = data;

    // Check for undefined values and replace them with null
    const params = [
      fieldName || null,
      degree || null,
      speciality || null,
      subSpeciality === undefined ? null : subSpeciality,
      contactNumber || null,
      mail === undefined ? null : mail,
      affiliatedHospitals || null,
      username || null,
    ];

    // Log the values being used in the query
    console.log("Values in updateDoctorsTable query:", params);

    // Execute the query
    const result = await db.execute(query, params);

    console.log("Result value from updateDoctorsTable", result);

    return result;
  } catch (error) {
    console.error("Error updating field:", error);
    throw error;
  }
}
async function bringProfileData(username, table) {
  try {
    console.log("entered in bringprofile data.");
    const query = `SELECT * from ${table} where username=?`;
    const result = await db.promise().query(query, [username]);

    console.log("entered in bringprofile data2.");

    return result;
  } catch (error) {
    console.log("error in bringing profile data");
  }
}
// Connect to the MySQL database

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "src", "login.html"));
});

function bringUsersTable() {
  return new Promise((resolve, reject) => {
    const query1 = "SELECT * FROM users";
    db.query(query1, (error, result) => {
      if (error) {
        console.log("wrong query");
        reject(error);
      } else {
        resolve(result);
      }
    });
  });
}

async function checkCredentials(username, password) {
  try {
    const result = await bringUsersTable();
    let usertype;
    let check=0;
    result.forEach((element) => {
      if (element.username == username) {
        if (element.password == password) {
          usertype = element;
          check=1;
        }
      }
    });
    if(check=1){
      return usertype;
    }
    else{
      return 'notfound';
    }
  } catch (error) {
    return 'notfound';
  }
}

app.post("/login", async (req, res) => {
  const newPage = await checkCredentials(
    req.body.usernameInputLogin,
    req.body.passwordInputLogin
  );

  if (!newPage || !newPage.type) {
    // Handle the case where newPage or newPage.type is undefined or null
    console.log("login credentials not found");
    res.send("<script>alert('Wrong username or password');</script>");
    return;
  }
  if (newPage.type == "doctor") {
    const Data = await bringProfileData(newPage.username, "doctors");
    const doctordata = Data[0][0];

    const redirectURL = `/doctorProfilePage.html?name=${doctordata.username}
    &field=${doctordata.field}
    &degree=${doctordata.degree}
    &speciality=${doctordata.speciality}
    &subspecial=${doctordata.subspecialization}
    &contact=${doctordata.contactnumber}
    &email=${doctordata.email}
    &affiliatedhospitals=${doctordata.affiliatedhospitals}
    &currentHospital=${doctordata.currentlyavailablehospoital}
    &availibility=${doctordata.available}
    &currentToken=${doctordata.currenttoken}
    &lastToken=${doctordata.lasttoken}
    &profilePic=${doctordata.profilepicture}`;

    res.redirect(redirectURL);

    // console.log("redirected to doctorprofile");
    // res.sendFile(path.join(__dirname, "src", "doctorProfilePage.html"));
  } else if (newPage.type == "user") {
    const data = await bringProfileData(newPage.username, "user");
    const userdata = data[0][0];
    const redirectURL = `/userProfilePage.html?username=${userdata.username}
    &contact=${userdata.contactnumber}
    &email=${userdata.email}
    &gender=${userdata.gender}
    &age=${userdata.age}
    &profilePic=${userdata.profilepicture}`;

    res.redirect(redirectURL);

    console.log("redirected to userprofile");
  } else {
    res.send("<script>alert('Wrong username or password');</script>");
  }
});

app.post("/signup", async (req, res) => {
  let availability = await signupCredentialChecker(req.body);
  if (availability == "available") {
    try {
      await createUser(req.body);

      res.sendFile(path.join(__dirname, "src", "login.html"));
    } catch (error) {}
  } else {
  }
});

async function createUser(data) {
  try {
    // Check if data.username is provided
    if (!data.usernameInputSignup) {
      throw new Error("Username is required.");
    }

    const query =
      "INSERT INTO users (username, password, type) VALUES (?, ?, 'user')";
    const [result] = await db
      .promise()
      .query(query, [data.usernameInputSignup, data.passwordInputSignup]);

    console.log("Result from createUser:", result);

    // You might want to check 'result.affectedRows' or 'result.insertId' for success validation

    return result;
  } catch (error) {
    console.error("Error executing query:", error);
    throw error;
  }
}

async function signupCredentialChecker(data) {
  try {
    let signUpState = "";

    if (!(data.passwordInputSignup == data.confirmpasswordInputSignup)) {
      signUpState = "notsamePassword";
    } else {
      let result = await bringUsersTable();

      for (let element of result) {
        if (element.username == data.usernameInputSignup) {
          console.log("username not available");
          signUpState = "username";
          break; // Stop iterating if the username is found
        } else if (element.password == data.passwordInputSignup) {
          console.log("password not available");
          signUpState = "password";
          break; // Stop iterating if the password is found
        }
      }

      if (signUpState === "") {
        signUpState = "available";
      }
    }

    return signUpState;
  } catch (error) {
    console.log(error);
  }
}

io.on("connection", (socket) => {
  console.log("A user connected");

  socket.on("updateToken", (data) => {
    updateTokens(data.username, data.fieldName, data.fieldValue);

    io.emit("tokenUpdate", data);
  });

  socket.on("availability", (data) => {
    updateTokens(data.username, "available", data.fieldValue);
    io.emit("updateAvailability", data);
  });


  socket.on("currentHospital", (data) => {
    updateTokens(data.username, "currentlyavailablehospoital", data.fieldValue);
    console.log("update in current hospital ");
    io.emit("currentHospitalUpdate", data);
  });
  
  socket.on("doctorlogOut", (data) => {
    doctorLogout(data);
  });
});


async function doctorLogout(data) {
  try {
    const query = `UPDATE doctors SET currentlyavailablehospoital = ?  , available = ? ,currenttoken=?,lasttoken=? WHERE username = ?`;

    await db.execute(query, ["none", false, 1, 1, data.username]);
  } catch (error) {}
}

async function updateTokens(userName, fieldName, fieldValue) {
  try {
    const query = `UPDATE doctors SET ${fieldName} = ? WHERE username = ?`;

    await db.execute(query, [fieldValue, userName]);
  } catch (error) {}
}

// Start the server and listen on the specified port
http.listen(port, () => {
  console.log(`listening on ${port}`);
});
