FROM node:22.14 AS build

WORKDIR /app

# Upgrade npm to match packageManager field in package.json
RUN npm install -g npm@11.6.2

# Copy package.json and package-lock.json to the container
COPY package*.json ./

# Install project dependencies
RUN npm ci

# Copy the entire project to the container
COPY . .

# Build the Angular app for production
RUN npm run build

# Use a smaller, production-ready image as the final image
FROM nginx:alpine

# Copy the custom nginx configuration file
COPY nginx.conf /etc/nginx/nginx.conf

# Copy the Angular app to the Nginx webserver's root directory
COPY --from=build /app/dist/coursequest-ui/browser /usr/share/nginx/html

# Expose port 80
EXPOSE 80

# Start Nginx
CMD ["nginx", "-g", "daemon off;"]
