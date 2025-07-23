CREATE TABLE users(
  id SERIAL PRIMARY KEY,
   fname VARCHAR(100), 
   lname VARCHAR(100),
   dateofbirth DATE,
  email VARCHAR(100),
   phone VARCHAR(100),
   password VARCHAR(100),
   country VARCHAR(100)
);