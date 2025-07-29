# Use Node.js base image
FROM node:22

# Create app directory inside container
WORKDIR /app

# Copy package.json and install dependencies
COPY package*.json ./
RUN npm install

# Copy the rest of the app files
COPY . .

# Expose the app port (change if your app uses another)
EXPOSE 3000

# Start the app
CMD ["node", "index.js"]
