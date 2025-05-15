import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import express from "express";
import session from "express-session";
import { z } from "zod";
import { 
  insertUserSchema, 
  insertDepartmentSchema, 
  insertResourceSchema, 
  insertPdfSchema,
  User,
  UserRole
} from "@shared/schema";
import fs from "fs";
import path from "path";
import crypto from "crypto";

declare module "express-session" {
  interface SessionData {
    userId: number;
  }
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Configure session middleware
  app.use(session({
    secret: process.env.SESSION_SECRET || "examen-de-stat-2025-secret",
    resave: false,
    saveUninitialized: false,
    cookie: { 
      secure: process.env.NODE_ENV === "production",
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
  }));

  // Define API routes with /api prefix
  const apiRouter = express.Router();
  
  // Ensure uploads directory exists
  const uploadsDir = path.join(process.cwd(), 'uploads');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  // Middleware to check if user is authenticated
  const isAuthenticated = async (req: Request, res: Response, next: Function) => {
    if (!req.session.userId) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    const user = await storage.getUser(req.session.userId);
    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }
    
    if (user.status !== "active") {
      return res.status(403).json({ message: "Account disabled" });
    }
    
    req.user = user;
    next();
  };

  // Middleware to check if user is admin
  const isAdmin = (req: Request, res: Response, next: Function) => {
    if (req.user.role !== UserRole.ADMIN) {
      return res.status(403).json({ message: "Admin access required" });
    }
    next();
  };

  // Middleware to check if user is admin or semi-admin
  const isAdminOrSemiAdmin = (req: Request, res: Response, next: Function) => {
    if (req.user.role !== UserRole.ADMIN && req.user.role !== UserRole.SEMI_ADMIN) {
      return res.status(403).json({ message: "Admin or semi-admin access required" });
    }
    next();
  };

  // Multer-like middleware for handling file uploads
  const uploadMiddleware = (req: Request, res: Response, next: Function) => {
    if (!req.headers['content-type']?.includes('multipart/form-data')) {
      return next();
    }

    let data = '';
    req.on('data', chunk => {
      data += chunk;
    });

    req.on('end', () => {
      try {
        // Find boundary
        const boundaryMatch = req.headers['content-type']?.match(/boundary=(?:"([^"]+)"|([^;]+))/);
        if (!boundaryMatch) throw new Error('No boundary found');
        const boundary = boundaryMatch[1] || boundaryMatch[2];

        // Split by boundary
        const parts = data.split(`--${boundary}`);
        
        // Process each part
        const files: any = {};
        const fields: any = {};

        for (const part of parts) {
          if (!part.trim() || part.includes('--\r\n')) continue;
          
          const [headerStr, ...bodyParts] = part.split('\r\n\r\n');
          const bodyContent = bodyParts.join('\r\n\r\n');
          
          if (headerStr.includes('filename=')) {
            // This is a file
            const filenameMatch = headerStr.match(/filename="([^"]+)"/);
            if (filenameMatch) {
              const originalFilename = filenameMatch[1];
              const extension = path.extname(originalFilename);
              const filename = `${crypto.randomBytes(16).toString('hex')}${extension}`;
              const filepath = path.join(uploadsDir, filename);
              
              // Extract content (remove trailing \r\n)
              const fileContent = bodyContent.substring(0, bodyContent.lastIndexOf('\r\n'));
              
              // Convert string to buffer and save
              const buffer = Buffer.from(fileContent, 'binary');
              fs.writeFileSync(filepath, buffer);
              
              files[originalFilename] = {
                filename,
                originalFilename,
                size: buffer.length,
                path: filepath
              };
            }
          } else {
            // This is a field
            const nameMatch = headerStr.match(/name="([^"]+)"/);
            if (nameMatch) {
              const fieldName = nameMatch[1];
              // Remove trailing \r\n
              fields[fieldName] = bodyContent.substring(0, bodyContent.lastIndexOf('\r\n'));
            }
          }
        }
        
        req.body = fields;
        req.files = files;
        next();
      } catch (err) {
        console.error('Error processing multipart form data:', err);
        res.status(400).json({ message: 'Error processing form data' });
      }
    });
  };

  // Authentication routes
  apiRouter.post("/auth/login", async (req, res) => {
    try {
      const { username, password } = req.body;
      if (!username || !password) {
        return res.status(400).json({ message: "Username and password are required" });
      }

      const user = await storage.getUserByUsername(username);
      if (!user || user.password !== password) {
        return res.status(401).json({ message: "Invalid username or password" });
      }

      if (user.status !== "active") {
        return res.status(403).json({ message: "Account disabled" });
      }

      req.session.userId = user.id;
      return res.json({ 
        id: user.id, 
        username: user.username, 
        role: user.role 
      });
    } catch (error) {
      return res.status(500).json({ message: "An error occurred during login" });
    }
  });

  apiRouter.post("/auth/logout", (req, res) => {
    req.session.destroy(err => {
      if (err) {
        return res.status(500).json({ message: "Failed to logout" });
      }
      res.json({ message: "Logged out successfully" });
    });
  });

  apiRouter.get("/auth/me", isAuthenticated, (req, res) => {
    const { id, username, role } = req.user;
    res.json({ id, username, role });
  });

  // User routes
  apiRouter.get("/users", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const users = await storage.getAllUsers();
      res.json(users.map(({ password, ...rest }) => rest)); // Remove passwords from response
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch users" });
    }
  });

  apiRouter.post("/users", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const userData = insertUserSchema.parse(req.body);
      const existingUser = await storage.getUserByUsername(userData.username);
      if (existingUser) {
        return res.status(409).json({ message: "Username already exists" });
      }
      const newUser = await storage.createUser(userData);
      const { password, ...userWithoutPassword } = newUser;
      res.status(201).json(userWithoutPassword);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid user data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create user" });
    }
  });

  apiRouter.patch("/users/:id", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      
      // Validate data
      const updateSchema = insertUserSchema.partial();
      const userData = updateSchema.parse(req.body);
      
      // Check if user exists
      const existingUser = await storage.getUser(id);
      if (!existingUser) {
        return res.status(404).json({ message: "User not found" });
      }
      
      // If username is changed, check if it's already taken
      if (userData.username && userData.username !== existingUser.username) {
        const userWithSameUsername = await storage.getUserByUsername(userData.username);
        if (userWithSameUsername) {
          return res.status(409).json({ message: "Username already exists" });
        }
      }
      
      const updatedUser = await storage.updateUser(id, userData);
      if (!updatedUser) {
        return res.status(404).json({ message: "User not found" });
      }
      
      const { password, ...userWithoutPassword } = updatedUser;
      res.json(userWithoutPassword);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid user data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to update user" });
    }
  });

  apiRouter.delete("/users/:id", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      
      // Check if user exists
      const user = await storage.getUser(id);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      // Prevent deletion of current user
      if (id === req.session.userId) {
        return res.status(400).json({ message: "Cannot delete your own account" });
      }
      
      const success = await storage.deleteUser(id);
      if (!success) {
        return res.status(404).json({ message: "User not found" });
      }
      
      res.json({ message: "User deleted successfully" });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete user" });
    }
  });

  // Department routes
  apiRouter.get("/departments", async (req, res) => {
    try {
      const departments = await storage.getAllDepartments();
      res.json(departments);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch departments" });
    }
  });

  apiRouter.get("/departments/:slug", async (req, res) => {
    try {
      const slug = req.params.slug;
      const department = await storage.getDepartmentBySlug(slug);
      
      if (!department) {
        return res.status(404).json({ message: "Department not found" });
      }
      
      res.json(department);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch department" });
    }
  });

  apiRouter.post("/departments", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const departmentData = insertDepartmentSchema.parse(req.body);
      
      // Check if department with same name or slug exists
      const departments = await storage.getAllDepartments();
      const nameExists = departments.some(d => d.name.toLowerCase() === departmentData.name.toLowerCase());
      const slugExists = departments.some(d => d.slug.toLowerCase() === departmentData.slug.toLowerCase());
      
      if (nameExists) {
        return res.status(409).json({ message: "Department name already exists" });
      }
      
      if (slugExists) {
        return res.status(409).json({ message: "Department slug already exists" });
      }
      
      const newDepartment = await storage.createDepartment(departmentData);
      res.status(201).json(newDepartment);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid department data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create department" });
    }
  });

  apiRouter.patch("/departments/:id", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      
      // Validate data
      const updateSchema = insertDepartmentSchema.partial();
      const departmentData = updateSchema.parse(req.body);
      
      // Check if department exists
      const existingDepartment = await storage.getDepartment(id);
      if (!existingDepartment) {
        return res.status(404).json({ message: "Department not found" });
      }
      
      // Check for name/slug conflicts if changing
      if (departmentData.name || departmentData.slug) {
        const departments = await storage.getAllDepartments();
        
        if (departmentData.name && departmentData.name !== existingDepartment.name) {
          const nameExists = departments.some(d => 
            d.id !== id && d.name.toLowerCase() === departmentData.name.toLowerCase()
          );
          if (nameExists) {
            return res.status(409).json({ message: "Department name already exists" });
          }
        }
        
        if (departmentData.slug && departmentData.slug !== existingDepartment.slug) {
          const slugExists = departments.some(d => 
            d.id !== id && d.slug.toLowerCase() === departmentData.slug.toLowerCase()
          );
          if (slugExists) {
            return res.status(409).json({ message: "Department slug already exists" });
          }
        }
      }
      
      const updatedDepartment = await storage.updateDepartment(id, departmentData);
      if (!updatedDepartment) {
        return res.status(404).json({ message: "Department not found" });
      }
      
      res.json(updatedDepartment);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid department data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to update department" });
    }
  });

  apiRouter.delete("/departments/:id", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      
      // Check if department exists
      const department = await storage.getDepartment(id);
      if (!department) {
        return res.status(404).json({ message: "Department not found" });
      }
      
      const success = await storage.deleteDepartment(id);
      if (!success) {
        return res.status(404).json({ message: "Department not found" });
      }
      
      res.json({ message: "Department and all associated resources deleted successfully" });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete department" });
    }
  });

  // Resource routes
  apiRouter.get("/resources", async (req, res) => {
    try {
      let resources;
      if (req.query.department) {
        const department = await storage.getDepartmentBySlug(req.query.department as string);
        if (!department) {
          return res.status(404).json({ message: "Department not found" });
        }
        resources = await storage.getResourcesByDepartment(department.id);
      } else {
        resources = await storage.getAllResources();
      }
      res.json(resources);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch resources" });
    }
  });

  apiRouter.post("/resources", isAuthenticated, isAdminOrSemiAdmin, async (req, res) => {
    try {
      const resourceData = insertResourceSchema.parse({
        ...req.body,
        createdById: req.user.id
      });
      
      // Verify department exists
      const department = await storage.getDepartment(resourceData.departmentId);
      if (!department) {
        return res.status(404).json({ message: "Department not found" });
      }
      
      const newResource = await storage.createResource(resourceData);
      res.status(201).json(newResource);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid resource data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create resource" });
    }
  });

  apiRouter.patch("/resources/:id", isAuthenticated, isAdminOrSemiAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      
      // Validate data
      const updateSchema = insertResourceSchema.partial();
      const resourceData = updateSchema.parse(req.body);
      
      // Check if resource exists
      const existingResource = await storage.getResource(id);
      if (!existingResource) {
        return res.status(404).json({ message: "Resource not found" });
      }
      
      // If changing department, verify it exists
      if (resourceData.departmentId && resourceData.departmentId !== existingResource.departmentId) {
        const department = await storage.getDepartment(resourceData.departmentId);
        if (!department) {
          return res.status(404).json({ message: "Department not found" });
        }
      }
      
      const updatedResource = await storage.updateResource(id, resourceData);
      if (!updatedResource) {
        return res.status(404).json({ message: "Resource not found" });
      }
      
      res.json(updatedResource);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid resource data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to update resource" });
    }
  });

  apiRouter.delete("/resources/:id", isAuthenticated, isAdminOrSemiAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      
      // Check if resource exists
      const resource = await storage.getResource(id);
      if (!resource) {
        return res.status(404).json({ message: "Resource not found" });
      }
      
      const success = await storage.deleteResource(id);
      if (!success) {
        return res.status(404).json({ message: "Resource not found" });
      }
      
      res.json({ message: "Resource deleted successfully" });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete resource" });
    }
  });

  // PDF routes
  apiRouter.get("/pdfs", async (req, res) => {
    try {
      let pdfs;
      if (req.query.department) {
        const department = await storage.getDepartmentBySlug(req.query.department as string);
        if (!department) {
          return res.status(404).json({ message: "Department not found" });
        }
        pdfs = await storage.getPdfsByDepartment(department.id);
      } else {
        pdfs = await storage.getAllPdfs();
      }
      res.json(pdfs);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch PDFs" });
    }
  });

  apiRouter.post("/pdfs", isAuthenticated, isAdminOrSemiAdmin, uploadMiddleware, async (req, res) => {
    try {
      if (!req.files || Object.keys(req.files).length === 0) {
        return res.status(400).json({ message: "No file uploaded" });
      }
      
      const file = Object.values(req.files)[0];
      const { departmentId, name, description } = req.body;
      
      if (!departmentId) {
        return res.status(400).json({ message: "Department ID is required" });
      }
      
      if (!name) {
        return res.status(400).json({ message: "Document name is required" });
      }
      
      // Verify department exists
      const department = await storage.getDepartment(parseInt(departmentId));
      if (!department) {
        return res.status(404).json({ message: "Department not found" });
      }
      
      const pdfData = {
        name: name,
        description: description || null,
        filename: file.filename,
        originalFilename: file.originalFilename,
        size: file.size,
        departmentId: parseInt(departmentId),
        uploadedById: req.user.id
      };
      
      const newPdf = await storage.createPdf(pdfData);
      res.status(201).json(newPdf);
    } catch (error) {
      res.status(500).json({ message: "Failed to upload PDF" });
    }
  });

  apiRouter.get("/pdfs/:id/download", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      
      // Check if PDF exists
      const pdf = await storage.getPdf(id);
      if (!pdf) {
        return res.status(404).json({ message: "PDF not found" });
      }
      
      const filePath = path.join(uploadsDir, pdf.filename);
      
      // Check if file exists
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ message: "File not found" });
      }
      
      res.download(filePath, pdf.originalFilename);
    } catch (error) {
      res.status(500).json({ message: "Failed to download PDF" });
    }
  });

  apiRouter.delete("/pdfs/:id", isAuthenticated, isAdminOrSemiAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      
      // Check if PDF exists
      const pdf = await storage.getPdf(id);
      if (!pdf) {
        return res.status(404).json({ message: "PDF not found" });
      }
      
      // Delete file
      const filePath = path.join(uploadsDir, pdf.filename);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      
      const success = await storage.deletePdf(id);
      if (!success) {
        return res.status(404).json({ message: "PDF not found" });
      }
      
      res.json({ message: "PDF deleted successfully" });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete PDF" });
    }
  });

  // Register the API router with /api prefix
  app.use("/api", apiRouter);

  // Create and return HTTP server
  const httpServer = createServer(app);
  return httpServer;
}
