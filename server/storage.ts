import { 
  users, 
  departments, 
  resources, 
  pdfs,
  type User, 
  type InsertUser, 
  type Department, 
  type InsertDepartment,
  type Resource,
  type InsertResource,
  type Pdf,
  type InsertPdf,
  UserRole,
  UserStatus
} from "@shared/schema";

export interface IStorage {
  // User methods
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  getAllUsers(): Promise<User[]>;
  updateUser(id: number, userData: Partial<User>): Promise<User | undefined>;
  deleteUser(id: number): Promise<boolean>;

  // Department methods
  getDepartment(id: number): Promise<Department | undefined>;
  getDepartmentBySlug(slug: string): Promise<Department | undefined>;
  createDepartment(department: InsertDepartment): Promise<Department>;
  getAllDepartments(): Promise<Department[]>;
  updateDepartment(id: number, departmentData: Partial<Department>): Promise<Department | undefined>;
  deleteDepartment(id: number): Promise<boolean>;

  // Resource methods
  getResource(id: number): Promise<Resource | undefined>;
  createResource(resource: InsertResource): Promise<Resource>;
  getResourcesByDepartment(departmentId: number): Promise<Resource[]>;
  getAllResources(): Promise<Resource[]>;
  updateResource(id: number, resourceData: Partial<Resource>): Promise<Resource | undefined>;
  deleteResource(id: number): Promise<boolean>;

  // PDF methods
  getPdf(id: number): Promise<Pdf | undefined>;
  createPdf(pdf: InsertPdf): Promise<Pdf>;
  getPdfsByDepartment(departmentId: number): Promise<Pdf[]>;
  getAllPdfs(): Promise<Pdf[]>;
  deletePdf(id: number): Promise<boolean>;
}

export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private departments: Map<number, Department>;
  private resources: Map<number, Resource>;
  private pdfs: Map<number, Pdf>;
  private userId: number;
  private departmentId: number;
  private resourceId: number;
  private pdfId: number;

  constructor() {
    this.users = new Map();
    this.departments = new Map();
    this.resources = new Map();
    this.pdfs = new Map();
    this.userId = 1;
    this.departmentId = 1;
    this.resourceId = 1;
    this.pdfId = 1;

    // Initialize with default users
    this.initializeDefaultData();
  }

  // Initialize default users and departments
  private initializeDefaultData() {
    // Create default admin user
    this.createUser({
      username: "TudorCh",
      password: "Examen",
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE
    });

    // Create default normal users
    this.createUser({
      username: "IrinaR",
      password: "Examen",
      role: UserRole.USER,
      status: UserStatus.ACTIVE
    });

    this.createUser({
      username: "AdeliU",
      password: "Examen",
      role: UserRole.USER,
      status: UserStatus.ACTIVE
    });

    this.createUser({
      username: "Examen2025",
      password: "Examen",
      role: UserRole.USER,
      status: UserStatus.ACTIVE
    });

    // Create default departments
    const departments = [
      { name: "Cardiologie", slug: "cardiologie", icon: "Heart", color: "#ef4444" },
      { name: "Chirurgie pediatrică", slug: "chirurgie-pediatrica", icon: "Baby", color: "#f97316" },
      { name: "Chirurgie generală semiologie (nr.3)", slug: "chirurgie-generala-semiologie", icon: "Syringe", color: "#f59e0b" },
      { name: "Chirurgie nr.1", slug: "chirurgie-1", icon: "Scissors", color: "#84cc16" },
      { name: "Chirurgie nr.2", slug: "chirurgie-2", icon: "Scalpel", color: "#10b981" },
      { name: "Gastroenterologie", slug: "gastroenterologie", icon: "Stomach", color: "#06b6d4" },
      { name: "Nefrologie", slug: "nefrologie", icon: "Kidney", color: "#3b82f6" },
      { name: "Obstetrică și ginecologie", slug: "obstetrica-ginecologie", icon: "Stethoscope", color: "#8b5cf6" },
      { name: "Pediatrie", slug: "pediatrie", icon: "BabyBottle", color: "#d946ef" },
      { name: "Pneumologie", slug: "pneumologie", icon: "Lungs", color: "#ec4899" },
      { name: "Reumatologie", slug: "reumatologie", icon: "Bone", color: "#f43f5e" },
      { name: "Toate testele", slug: "toate-testele", icon: "FileText", color: "#64748b" }
    ];

    departments.forEach(dept => {
      this.createDepartment(dept as InsertDepartment);
    });

    // Add some sample resources for Cardiologie
    const cardiologyDept = this.getDepartmentBySlug("cardiologie");
    if (cardiologyDept) {
      const resources = [
        { title: "Cardiologie 1-50", url: "https://example.com/cardiologie/1-50", departmentId: cardiologyDept.id, createdById: 1 },
        { title: "Cardiologie 51-100", url: "https://example.com/cardiologie/51-100", departmentId: cardiologyDept.id, createdById: 1 },
        { title: "Cardiologie 101-150", url: "https://example.com/cardiologie/101-150", departmentId: cardiologyDept.id, createdById: 1 },
        { title: "Cardiologie 151-200", url: "https://example.com/cardiologie/151-200", departmentId: cardiologyDept.id, createdById: 1 },
      ];

      resources.forEach(resource => {
        this.createResource(resource as InsertResource);
      });

      // Add sample PDFs
      const pdfs = [
        { 
          name: "Ghid de practică clinică în cardiologie 2025",
          description: "Ghidul oficial pentru practica clinică cu cele mai recente recomandări",
          filename: "cardiologie_guide_2025.pdf", 
          originalFilename: "Ghid de practică clinică în cardiologie 2025.pdf", 
          size: 15000000, 
          departmentId: cardiologyDept.id, 
          uploadedById: 1 
        },
        { 
          name: "Algoritmi pentru interpretarea EKG",
          description: "Colecție de algoritmi diagnostici pentru interpretarea electrocardiogramelor",
          filename: "ekg_algorithms.pdf", 
          originalFilename: "Algoritmi pentru EKG interpretare.pdf", 
          size: 8000000, 
          departmentId: cardiologyDept.id, 
          uploadedById: 1 
        }
      ];

      pdfs.forEach(pdf => {
        this.createPdf(pdf as InsertPdf);
      });
    }
  }

  // User methods
  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    for (const user of this.users.values()) {
      if (user.username.toLowerCase() === username.toLowerCase()) {
        return user;
      }
    }
    return undefined;
  }

  async createUser(userData: InsertUser): Promise<User> {
    const id = this.userId++;
    const user: User = { ...userData, id };
    this.users.set(id, user);
    return user;
  }

  async getAllUsers(): Promise<User[]> {
    return Array.from(this.users.values());
  }

  async updateUser(id: number, userData: Partial<User>): Promise<User | undefined> {
    const user = await this.getUser(id);
    if (!user) return undefined;

    const updatedUser = { ...user, ...userData };
    this.users.set(id, updatedUser);
    return updatedUser;
  }

  async deleteUser(id: number): Promise<boolean> {
    return this.users.delete(id);
  }

  // Department methods
  async getDepartment(id: number): Promise<Department | undefined> {
    return this.departments.get(id);
  }

  async getDepartmentBySlug(slug: string): Promise<Department | undefined> {
    for (const dept of this.departments.values()) {
      if (dept.slug === slug) {
        return dept;
      }
    }
    return undefined;
  }

  async createDepartment(departmentData: InsertDepartment): Promise<Department> {
    const id = this.departmentId++;
    const department: Department = { ...departmentData, id };
    this.departments.set(id, department);
    return department;
  }

  async getAllDepartments(): Promise<Department[]> {
    return Array.from(this.departments.values());
  }

  async updateDepartment(id: number, departmentData: Partial<Department>): Promise<Department | undefined> {
    const department = await this.getDepartment(id);
    if (!department) return undefined;

    const updatedDepartment = { ...department, ...departmentData };
    this.departments.set(id, updatedDepartment);
    return updatedDepartment;
  }

  async deleteDepartment(id: number): Promise<boolean> {
    // First delete all resources and PDFs associated with this department
    const resourcesToDelete = await this.getResourcesByDepartment(id);
    const pdfsToDelete = await this.getPdfsByDepartment(id);

    for (const resource of resourcesToDelete) {
      await this.deleteResource(resource.id);
    }

    for (const pdf of pdfsToDelete) {
      await this.deletePdf(pdf.id);
    }

    return this.departments.delete(id);
  }

  // Resource methods
  async getResource(id: number): Promise<Resource | undefined> {
    return this.resources.get(id);
  }

  async createResource(resourceData: InsertResource): Promise<Resource> {
    const id = this.resourceId++;
    const resource: Resource = { 
      ...resourceData, 
      id, 
      createdAt: new Date()
    };
    this.resources.set(id, resource);
    return resource;
  }

  async getResourcesByDepartment(departmentId: number): Promise<Resource[]> {
    return Array.from(this.resources.values()).filter(
      (resource) => resource.departmentId === departmentId
    );
  }

  async getAllResources(): Promise<Resource[]> {
    return Array.from(this.resources.values());
  }

  async updateResource(id: number, resourceData: Partial<Resource>): Promise<Resource | undefined> {
    const resource = await this.getResource(id);
    if (!resource) return undefined;

    const updatedResource = { ...resource, ...resourceData };
    this.resources.set(id, updatedResource);
    return updatedResource;
  }

  async deleteResource(id: number): Promise<boolean> {
    return this.resources.delete(id);
  }

  // PDF methods
  async getPdf(id: number): Promise<Pdf | undefined> {
    return this.pdfs.get(id);
  }

  async createPdf(pdfData: InsertPdf): Promise<Pdf> {
    const id = this.pdfId++;
    const pdf: Pdf = { 
      ...pdfData, 
      name: pdfData.name || pdfData.originalFilename, // Use name if provided, otherwise use original filename
      description: pdfData.description || null,
      id, 
      uploadedAt: new Date() 
    };
    this.pdfs.set(id, pdf);
    return pdf;
  }

  async getPdfsByDepartment(departmentId: number): Promise<Pdf[]> {
    return Array.from(this.pdfs.values()).filter(
      (pdf) => pdf.departmentId === departmentId
    );
  }

  async getAllPdfs(): Promise<Pdf[]> {
    return Array.from(this.pdfs.values());
  }

  async deletePdf(id: number): Promise<boolean> {
    return this.pdfs.delete(id);
  }
}

export const storage = new MemStorage();
