-- CreateTable
CREATE TABLE "CompanyTax" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "npwp15" TEXT,
    "npwp16" TEXT,
    "taxDate" TIMESTAMP(3),
    "taxpayerName" TEXT,
    "isTaxpayer" BOOLEAN NOT NULL DEFAULT false,
    "taxIdNumber" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyTax_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyDocument" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "docType" TEXT NOT NULL,
    "label" TEXT,
    "originalName" TEXT NOT NULL,
    "storedName" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "originalSize" INTEGER NOT NULL,
    "compressedSize" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DIAJUKAN',
    "uploadedById" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verifiedById" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "verifyNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Agent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "avatarColor" TEXT NOT NULL DEFAULT '#007AFD',
    "skills" TEXT NOT NULL DEFAULT '[]',
    "systemInstructions" TEXT NOT NULL DEFAULT '',
    "tools" TEXT NOT NULL DEFAULT '[]',
    "currentStatus" TEXT NOT NULL DEFAULT 'IDLE',
    "currentTaskId" TEXT,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Agent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentTask" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "agentId" TEXT,
    "createdById" TEXT,
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "inputPayload" TEXT NOT NULL DEFAULT '{}',
    "resultPayload" TEXT,
    "errorMessage" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "requiresApproval" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "message" TEXT NOT NULL DEFAULT '',
    "payload" TEXT NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentMessage" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "senderAgentId" TEXT NOT NULL,
    "receiverAgentId" TEXT NOT NULL,
    "taskId" TEXT,
    "content" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SENT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentActivity" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "activityType" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "metadata" TEXT NOT NULL DEFAULT '{}',

    CONSTRAINT "AgentActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Approval" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "requestedByAgentId" TEXT,
    "approvalType" TEXT NOT NULL DEFAULT 'GENERAL',
    "description" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Approval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Permission" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "description" TEXT,
    "module" TEXT NOT NULL DEFAULT 'Umum',

    CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RolePermission" (
    "roleId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("roleId","permissionId")
);

-- CreateTable
CREATE TABLE "Membership" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "departmentId" TEXT,
    "jobTitle" TEXT,

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserEmployment" (
    "id" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "companyName" TEXT,
    "employeeId" TEXT,
    "organizationName" TEXT,
    "position" TEXT,
    "jobLevel" TEXT,
    "employmentStatus" TEXT,
    "branch" TEXT,
    "joinDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "grade" TEXT,
    "classLevel" TEXT,
    "managerId" TEXT,
    "approvalApproverId" TEXT,
    "approvalNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserEmployment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserCustomFieldDef" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "options" TEXT,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserCustomFieldDef_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserCustomValue" (
    "id" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "fieldDefId" TEXT NOT NULL,
    "value" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserCustomValue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserModuleAccess" (
    "id" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "moduleKey" TEXT NOT NULL,
    "allowed" BOOLEAN NOT NULL DEFAULT true,
    "access" TEXT NOT NULL DEFAULT 'WRITE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserModuleAccess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Department" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Department_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Channel" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DISCONNECTED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Channel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChannelAccount" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "externalId" TEXT,
    "displayName" TEXT,
    "credentials" TEXT NOT NULL DEFAULT '{}',
    "verifyToken" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DISCONNECTED',
    "lastTestAt" TIMESTAMP(3),
    "lastTestOk" BOOLEAN,
    "lastError" TEXT,
    "connectedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChannelAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "company" TEXT,
    "industry" TEXT,
    "source" TEXT,
    "business" TEXT,
    "interest" TEXT,
    "budget" TEXT,
    "stage" TEXT NOT NULL DEFAULT 'Baru',
    "score" TEXT,
    "ownerId" TEXT,
    "unreadCount" INTEGER NOT NULL DEFAULT 0,
    "lastMessageAt" TIMESTAMP(3),
    "lastPurchase" TEXT,
    "nextFollowUp" TIMESTAMP(3),
    "meta" TEXT NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "waLid" TEXT,
    "photoUrl" TEXT,
    "photoCheckedAt" TIMESTAMP(3),

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tag" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#087BFF',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerTag" (
    "customerId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,

    CONSTRAINT "CustomerTag_pkey" PRIMARY KEY ("customerId","tagId")
);

-- CreateTable
CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "channelId" TEXT,
    "channelType" TEXT NOT NULL DEFAULT 'WHATSAPP',
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "assignedTo" TEXT NOT NULL DEFAULT 'WOO',
    "assigneeId" TEXT,
    "lastMessageAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "botEnabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConversationMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "senderType" TEXT NOT NULL,
    "senderId" TEXT,
    "body" TEXT NOT NULL,
    "messageType" TEXT NOT NULL DEFAULT 'TEXT',
    "metadata" TEXT NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConversationMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Note" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Note_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Activity" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "customerId" TEXT,
    "actorId" TEXT,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Activity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadStage" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "color" TEXT NOT NULL DEFAULT '#087BFF',

    CONSTRAINT "LeadStage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "stageId" TEXT NOT NULL,
    "ownerId" TEXT,
    "value" DOUBLE PRECISION,
    "score" TEXT,
    "source" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DealStage" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "DealStage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Deal" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "stageId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "value" DOUBLE PRECISION,
    "ownerId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "expectedCloseAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Deal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FollowUp" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "assignedToId" TEXT,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FollowUp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "channelType" TEXT NOT NULL DEFAULT 'WHATSAPP',
    "message" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "audienceFilter" TEXT NOT NULL DEFAULT '{}',
    "scheduledAt" TIMESTAMP(3),
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "deliveredCount" INTEGER NOT NULL DEFAULT 0,
    "readCount" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "imagePath" TEXT,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignRecipient" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "error" TEXT,
    "sentAt" TIMESTAMP(3),
    "waMessageId" TEXT,
    "readAt" TIMESTAMP(3),

    CONSTRAINT "CampaignRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BotFlow" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BotFlow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BotNode" (
    "id" TEXT NOT NULL,
    "flowId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "config" TEXT NOT NULL DEFAULT '{}',
    "position" TEXT NOT NULL DEFAULT '{}',
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "BotNode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "description" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT,
    "tokenId" TEXT NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invitation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "invitedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "plan" TEXT NOT NULL DEFAULT 'FREE',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "currentPeriodEnd" TIMESTAMP(3),
    "trialEndsAt" TIMESTAMP(3),
    "billingCycle" TEXT NOT NULL DEFAULT 'MONTHLY',
    "userQuota" INTEGER NOT NULL DEFAULT 0,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubscriptionModule" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "moduleKey" TEXT NOT NULL,
    "pricePerUserSnapshot" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubscriptionModule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "subscriptionId" TEXT,
    "number" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "billingCycle" TEXT NOT NULL DEFAULT 'MONTHLY',
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "subtotal" INTEGER NOT NULL,
    "total" INTEGER NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "paidAt" TIMESTAMP(3),
    "paidNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceItem" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "moduleKey" TEXT,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPrice" INTEGER NOT NULL,
    "amount" INTEGER NOT NULL,

    CONSTRAINT "InvoiceItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReplyTemplate" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'Umum',
    "body" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReplyTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HrVacancy" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "department" TEXT,
    "location" TEXT,
    "employmentType" TEXT NOT NULL DEFAULT 'PKWTT',
    "quota" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "description" TEXT,
    "salaryMin" DOUBLE PRECISION,
    "salaryMax" DOUBLE PRECISION,
    "publishedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HrVacancy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HrCandidate" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "vacancyId" TEXT,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "birthDate" TIMESTAMP(3),
    "education" TEXT,
    "experience" TEXT,
    "cvUrl" TEXT,
    "source" TEXT,
    "stage" TEXT NOT NULL DEFAULT 'LAMARAN',
    "rating" INTEGER,
    "notes" TEXT,
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "cvName" TEXT,

    CONSTRAINT "HrCandidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HrEmployee" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "employeeNo" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "birthDate" TIMESTAMP(3),
    "position" TEXT NOT NULL,
    "department" TEXT,
    "joinDate" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'AKTIF',
    "candidateId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "nik" TEXT,

    CONSTRAINT "HrEmployee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HrContract" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "contractNo" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'PKWTT',
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "probationEnd" TIMESTAMP(3),
    "salary" DOUBLE PRECISION,
    "position" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'AKTIF',
    "fileUrl" TEXT,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HrContract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BotConfig" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT false,
    "systemPrompt" TEXT,
    "creditBalance" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BotConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditLedger" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "reference" TEXT NOT NULL,
    "description" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditLedger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BotUsage" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "conversationId" TEXT,
    "messageId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RESERVED',
    "amount" INTEGER NOT NULL,
    "model" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BotUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TopUpRequest" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "note" TEXT,
    "requestedById" TEXT NOT NULL,
    "handledById" TEXT,
    "handledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TopUpRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MasterLedger" (
    "id" TEXT NOT NULL,
    "seq" SERIAL NOT NULL,
    "type" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "reference" TEXT NOT NULL,
    "description" TEXT,
    "organizationId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MasterLedger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OfficeLayout" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "x" DOUBLE PRECISION NOT NULL DEFAULT 50,
    "y" DOUBLE PRECISION NOT NULL DEFAULT 50,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OfficeLayout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EsignDocument" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "documentNumber" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT,
    "originalFilePath" TEXT,
    "finalFilePath" TEXT,
    "originalHash" TEXT,
    "finalHash" TEXT,
    "extractedText" TEXT,
    "createdById" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "workflowType" TEXT NOT NULL DEFAULT 'SEQUENTIAL',
    "approvalStatus" TEXT NOT NULL DEFAULT 'NOT_REQUIRED',
    "approverId" TEXT,
    "currentStep" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "showSignerName" BOOLEAN NOT NULL DEFAULT true,
    "showSignerPosition" BOOLEAN NOT NULL DEFAULT true,
    "showSignedDate" BOOLEAN NOT NULL DEFAULT true,
    "showDocRef" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EsignDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EsignSigner" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "signerName" TEXT NOT NULL,
    "signerEmail" TEXT,
    "signerPhone" TEXT,
    "signerPosition" TEXT,
    "signerDepartment" TEXT,
    "signingOrder" INTEGER NOT NULL,
    "signingGroup" INTEGER NOT NULL DEFAULT 0,
    "signingStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "placementPage" INTEGER,
    "placementX" DOUBLE PRECISION,
    "placementY" DOUBLE PRECISION,
    "placementWidth" DOUBLE PRECISION,
    "placementHeight" DOUBLE PRECISION,
    "accessToken" TEXT,
    "tokenExpiresAt" TIMESTAMP(3),
    "signedAt" TIMESTAMP(3),
    "rejectedReason" TEXT,

    CONSTRAINT "EsignSigner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EsignSignature" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "signerId" TEXT NOT NULL,
    "signatureAsset" TEXT NOT NULL,
    "signatureMethod" TEXT NOT NULL,
    "signatureHash" TEXT NOT NULL,
    "confirmationTimestamp" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "deviceInfo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EsignSignature_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EsignWaSignSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "documentId" TEXT,
    "signerId" TEXT,
    "state" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EsignWaSignSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EsignTemplate" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "filePath" TEXT,
    "generator" TEXT,
    "placeholders" TEXT NOT NULL DEFAULT '{}',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EsignTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EsignAuditLog" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "metadata" TEXT NOT NULL DEFAULT '{}',
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "documentHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EsignAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EsignNotification" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "signerId" TEXT,
    "recipientId" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'WHATSAPP',
    "eventType" TEXT NOT NULL,
    "deliveryStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "waMessageId" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EsignNotification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuranBookmark" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "surahId" INTEGER NOT NULL,
    "surahName" TEXT NOT NULL,
    "surahArabic" TEXT,
    "ayahNumber" INTEGER NOT NULL,
    "ayahArabic" TEXT,
    "ayahTranslation" TEXT,
    "note" TEXT,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuranBookmark_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrayerUserSetting" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "imsak" TEXT,
    "subuh" TEXT,
    "terbit" TEXT,
    "dhuha" TEXT,
    "dzuhur" TEXT,
    "ashar" TEXT,
    "maghrib" TEXT,
    "isya" TEXT,
    "preAlarmMinutes" INTEGER,
    "enablePreAlarm" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PrayerUserSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoldPriceHistory" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "priceDate" DATE NOT NULL,
    "prices" JSONB NOT NULL DEFAULT '{}',
    "buybackPrices" JSONB NOT NULL DEFAULT '{}',
    "hargaTaksir24K" DOUBLE PRECISION,
    "source" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GoldPriceHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Simulation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "data" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Simulation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoldSetting" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GoldSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KirimUrl" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'simulasi',
    "judul" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "deskripsi" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KirimUrl_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Announcement" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL DEFAULT '',
    "content" TEXT NOT NULL DEFAULT '',
    "imageUrl" TEXT,
    "category" TEXT NOT NULL DEFAULT 'announcement',
    "priority" TEXT NOT NULL DEFAULT 'normal',
    "route" TEXT NOT NULL DEFAULT '',
    "customRoute" TEXT NOT NULL DEFAULT '',
    "targetMode" TEXT NOT NULL DEFAULT 'all',
    "target" JSONB NOT NULL DEFAULT '{}',
    "filters" JSONB NOT NULL DEFAULT '{}',
    "channels" JSONB NOT NULL DEFAULT '{"app": true, "email": false}',
    "recipientEmails" JSONB NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "scheduledAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "emailStatus" TEXT NOT NULL DEFAULT 'not_requested',
    "emailSent" INTEGER NOT NULL DEFAULT 0,
    "emailFailed" INTEGER NOT NULL DEFAULT 0,
    "emailError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Announcement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationPreference" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "prefs" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TalTask" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "isAdditional" BOOLEAN NOT NULL DEFAULT false,
    "originalTaskId" TEXT,
    "taskDate" DATE,
    "taskTime" TEXT,
    "weekNumber" INTEGER,
    "weekYear" INTEGER,
    "month" INTEGER,
    "year" INTEGER,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "parentId" TEXT,
    "parentTitle" TEXT,
    "category" TEXT NOT NULL DEFAULT 'non_result',
    "targetValue" DOUBLE PRECISION,
    "targetUnit" TEXT,
    "targetCustomUnit" TEXT,
    "priority" TEXT NOT NULL DEFAULT 'medium',
    "assignedTo" JSONB NOT NULL DEFAULT '[]',
    "assignedUserEmails" JSONB NOT NULL DEFAULT '[]',
    "assignedUsers" JSONB NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'todo',
    "notes" TEXT,
    "attachments" JSONB NOT NULL DEFAULT '[]',
    "actualValue" DOUBLE PRECISION,
    "blockerCategory" TEXT,
    "blockerDescription" TEXT,
    "blockerReportedAt" TIMESTAMP(3),
    "isRolledOver" BOOLEAN NOT NULL DEFAULT false,
    "rolloverAction" TEXT,
    "rolloverTargetDate" DATE,
    "rolloverTargetWeek" INTEGER,
    "rolloverTargetYear" INTEGER,
    "rolloverTargetMonth" INTEGER,
    "cancelNotes" TEXT,
    "enableReminder" BOOLEAN NOT NULL DEFAULT false,
    "reminderType" TEXT,
    "reminderMinutesBefore" INTEGER,
    "reminderTime" TEXT,
    "reminderLastTriggeredAt" TIMESTAMP(3),
    "orderNo" INTEGER,
    "userId" TEXT NOT NULL,
    "userEmail" TEXT,
    "userName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TalTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TalRoutineTemplate" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "categoryTag" TEXT,
    "color" TEXT,
    "isPreset" BOOLEAN NOT NULL DEFAULT false,
    "template" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TalRoutineTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TalMonthlyLock" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "isLocked" BOOLEAN NOT NULL DEFAULT false,
    "lockedAt" TIMESTAMP(3),
    "payload" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TalMonthlyLock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TalLockReport" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "scopeKey" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "isPlanLocked" BOOLEAN NOT NULL DEFAULT false,
    "planLockedAt" TIMESTAMP(3),
    "isReported" BOOLEAN NOT NULL DEFAULT false,
    "reportedAt" TIMESTAMP(3),
    "payload" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TalLockReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TalCuti" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "cutiDate" DATE NOT NULL,
    "userId" TEXT NOT NULL,
    "userName" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TalCuti_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TalHoliday" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "holidayDate" DATE NOT NULL,
    "name" TEXT,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TalHoliday_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TalBadge" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "badgeId" TEXT NOT NULL,
    "name" TEXT,
    "description" TEXT,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TalBadge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserBadgeProgress" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "badgeId" TEXT NOT NULL,
    "seasonYear" INTEGER NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserBadgeProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserTrophy" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "badgeId" TEXT,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserTrophy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TalSetting" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TalSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TalDeadlineSetting" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TalDeadlineSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TalUserObligation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userEmail" TEXT,
    "userName" TEXT,
    "daily" BOOLEAN NOT NULL DEFAULT true,
    "weekly" BOOLEAN NOT NULL DEFAULT true,
    "monthly" BOOLEAN NOT NULL DEFAULT true,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TalUserObligation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TalTeamVisibility" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "viewerId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TalTeamVisibility_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TalAuditLog" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT,
    "actionType" TEXT NOT NULL,
    "actionTitle" TEXT NOT NULL DEFAULT '',
    "adminEmail" TEXT NOT NULL DEFAULT '',
    "adminName" TEXT NOT NULL DEFAULT '',
    "reason" TEXT NOT NULL DEFAULT '',
    "targetSummary" TEXT NOT NULL DEFAULT '',
    "affectedCount" INTEGER NOT NULL DEFAULT 0,
    "details" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TalAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KoperasiAnggota" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "cabang" TEXT NOT NULL DEFAULT '',
    "nik" TEXT NOT NULL,
    "namaLengkap" TEXT NOT NULL,
    "tempatLahir" TEXT NOT NULL DEFAULT '',
    "tanggalLahir" DATE,
    "jenisKelamin" TEXT NOT NULL DEFAULT '',
    "alamatKtp" TEXT NOT NULL DEFAULT '',
    "noHp" TEXT NOT NULL DEFAULT '',
    "namaIbuKandung" TEXT NOT NULL DEFAULT '',
    "pekerjaan" TEXT NOT NULL DEFAULT '',
    "statusPerkawinan" TEXT NOT NULL DEFAULT '',
    "penghasilanBulanan" TEXT NOT NULL DEFAULT '',
    "tujuanKeanggotaan" TEXT NOT NULL DEFAULT '',
    "fotoKtpPath" TEXT NOT NULL DEFAULT '',
    "fotoAnggotaPath" TEXT NOT NULL DEFAULT '',
    "tandaTanganPath" TEXT NOT NULL DEFAULT '',
    "setujuMobileBanking" BOOLEAN NOT NULL DEFAULT false,
    "setujuPernyataan" BOOLEAN NOT NULL DEFAULT false,
    "hasSimpanan" BOOLEAN NOT NULL DEFAULT false,
    "hasPinjaman" BOOLEAN NOT NULL DEFAULT false,
    "createdBy" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KoperasiAnggota_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KoperasiSetting" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "settings" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KoperasiSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ticket" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'Umum',
    "priority" TEXT NOT NULL DEFAULT 'normal',
    "status" TEXT NOT NULL DEFAULT 'TERBUKA',
    "description" TEXT NOT NULL DEFAULT '',
    "assignedToId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Ticket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketReply" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketReply_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArchiveCategory" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "parentId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ArchiveCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArchiveDocument" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "documentNumber" TEXT,
    "documentDate" TIMESTAMP(3),
    "description" TEXT,
    "filePath" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL,
    "uploaderId" TEXT NOT NULL,
    "confidentiality" TEXT NOT NULL DEFAULT 'INTERNAL',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ArchiveDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Meeting" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "hostId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3),
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Jakarta',
    "meetingType" TEXT NOT NULL DEFAULT 'INTERNAL',
    "locationType" TEXT NOT NULL DEFAULT 'ONLINE',
    "joinUrl" TEXT,
    "location" TEXT,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "password" TEXT,
    "waitingRoom" BOOLEAN NOT NULL DEFAULT false,
    "allowJoinBeforeHost" BOOLEAN NOT NULL DEFAULT false,
    "muteOnEntry" BOOLEAN NOT NULL DEFAULT false,
    "allowScreenShare" BOOLEAN NOT NULL DEFAULT true,
    "allowChat" BOOLEAN NOT NULL DEFAULT true,
    "allowRecording" BOOLEAN NOT NULL DEFAULT false,
    "isRecurring" BOOLEAN NOT NULL DEFAULT false,
    "recurrenceRule" TEXT,
    "roomName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Meeting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeetingParticipant" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "userId" TEXT,
    "guestName" TEXT,
    "guestEmail" TEXT,
    "guestPhone" TEXT,
    "snapshotPosition" TEXT,
    "snapshotDepartment" TEXT,
    "snapshotBranch" TEXT,
    "role" TEXT NOT NULL DEFAULT 'PARTICIPANT',
    "isRequired" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'INVITED',
    "respondedAt" TIMESTAMP(3),
    "joinedAt" TIMESTAMP(3),
    "leftAt" TIMESTAMP(3),

    CONSTRAINT "MeetingParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeetingGuestToken" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "tokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT NOT NULL DEFAULT 'JOIN',
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MeetingGuestToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeetingSession" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "participantId" TEXT,
    "userId" TEXT,
    "guestName" TEXT,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" TIMESTAMP(3),
    "durationSeconds" INTEGER,

    CONSTRAINT "MeetingSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeetingChatMessage" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "senderId" TEXT,
    "senderName" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "isPrivate" BOOLEAN NOT NULL DEFAULT false,
    "recipientId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MeetingChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeetingRecording" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL,
    "durationSeconds" INTEGER,
    "uploaderId" TEXT NOT NULL,
    "confidentiality" TEXT NOT NULL DEFAULT 'INTERNAL',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MeetingRecording_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeetingSetting" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "maxDurationMinutes" INTEGER NOT NULL DEFAULT 120,
    "maxParticipants" INTEGER NOT NULL DEFAULT 50,
    "waitingRoomDefault" BOOLEAN NOT NULL DEFAULT false,
    "allowGuest" BOOLEAN NOT NULL DEFAULT true,
    "allowScreenShare" BOOLEAN NOT NULL DEFAULT true,
    "allowChat" BOOLEAN NOT NULL DEFAULT true,
    "allowRecording" BOOLEAN NOT NULL DEFAULT false,
    "recordingRetentionDays" INTEGER NOT NULL DEFAULT 30,
    "defaultTimezone" TEXT NOT NULL DEFAULT 'Asia/Jakarta',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MeetingSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeetingAgendaItem" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "durationMinutes" INTEGER,
    "order" INTEGER NOT NULL DEFAULT 0,
    "presenterId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',

    CONSTRAINT "MeetingAgendaItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeetingNote" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MeetingNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "sourceModule" TEXT,
    "sourceRecordId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL DEFAULT 'other',
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Jakarta',
    "isAllDay" BOOLEAN NOT NULL DEFAULT false,
    "location" TEXT,
    "meetingLink" TEXT,
    "visibility" TEXT NOT NULL DEFAULT 'COMPANY',
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "recurrenceRule" TEXT,
    "recurrenceParentId" TEXT,
    "recurrenceOriginalStartAt" TIMESTAMP(3),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarAttendee" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "responseStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "respondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarAttendee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarReminder" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "minutesBefore" INTEGER NOT NULL,
    "remindAt" TIMESTAMP(3) NOT NULL,
    "deliveryStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CalendarReminder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarSyncLog" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "sourceModule" TEXT NOT NULL,
    "sourceRecordId" TEXT NOT NULL,
    "eventId" TEXT,
    "syncStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "errorMessage" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "lastSyncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarSyncLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarUserPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "defaultView" TEXT NOT NULL DEFAULT 'month',
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Jakarta',
    "firstDayOfWeek" INTEGER NOT NULL DEFAULT 1,
    "workingHours" JSONB NOT NULL DEFAULT '{}',
    "notificationPreferences" JSONB NOT NULL DEFAULT '{}',
    "visibleCalendars" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarUserPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyWorkNote" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "title" TEXT,
    "content" TEXT,
    "visibility" TEXT NOT NULL DEFAULT 'PRIVATE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyWorkNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyWorkspacePreference" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "layoutConfiguration" JSONB NOT NULL DEFAULT '{}',
    "visibleWidgets" JSONB NOT NULL DEFAULT '[]',
    "widgetOrder" JSONB NOT NULL DEFAULT '[]',
    "quickActions" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyWorkspacePreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttendanceLocation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "radiusMeters" INTEGER NOT NULL DEFAULT 100,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttendanceLocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Shift" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "isNightShift" BOOLEAN NOT NULL DEFAULT false,
    "breakMinutes" INTEGER NOT NULL DEFAULT 60,
    "graceLateMinutes" INTEGER NOT NULL DEFAULT 15,
    "color" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Shift_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkSchedule" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "userId" TEXT,
    "departmentId" TEXT,
    "daysOfWeek" JSONB NOT NULL DEFAULT '{}',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "effectiveFrom" DATE,
    "effectiveTo" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttendanceRecord" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "shiftId" TEXT,
    "scheduleId" TEXT,
    "locationId" TEXT,
    "checkInAt" TIMESTAMP(3),
    "checkInLat" DOUBLE PRECISION,
    "checkInLng" DOUBLE PRECISION,
    "checkInMethod" TEXT,
    "checkInNote" TEXT,
    "checkOutAt" TIMESTAMP(3),
    "checkOutLat" DOUBLE PRECISION,
    "checkOutLng" DOUBLE PRECISION,
    "checkOutMethod" TEXT,
    "checkOutNote" TEXT,
    "status" TEXT NOT NULL DEFAULT 'INCOMPLETE',
    "lateMinutes" INTEGER NOT NULL DEFAULT 0,
    "earlyMinutes" INTEGER NOT NULL DEFAULT 0,
    "overtimeMinutes" INTEGER NOT NULL DEFAULT 0,
    "workMinutes" INTEGER NOT NULL DEFAULT 0,
    "breakMinutes" INTEGER NOT NULL DEFAULT 0,
    "isRemote" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttendanceRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttendanceCorrection" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "requestedValue" JSONB NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttendanceCorrection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OvertimeRequest" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OvertimeRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttendanceSetting" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "requireGeofence" BOOLEAN NOT NULL DEFAULT true,
    "allowRemoteCheckIn" BOOLEAN NOT NULL DEFAULT false,
    "defaultLocationId" TEXT,
    "graceLateMinutes" INTEGER NOT NULL DEFAULT 15,
    "workDays" JSONB NOT NULL DEFAULT '[1,2,3,4,5]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttendanceSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrayerTimeSettings" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "latitude" DOUBLE PRECISION NOT NULL DEFAULT -6.2088,
    "longitude" DOUBLE PRECISION NOT NULL DEFAULT 106.8456,
    "cityName" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Jakarta',
    "calculationMethod" TEXT NOT NULL DEFAULT 'kemenag',
    "asrMethod" TEXT NOT NULL DEFAULT 'shafii',
    "adjustmentMinutes" INTEGER NOT NULL DEFAULT 0,
    "sessionDurationMinutes" INTEGER NOT NULL DEFAULT 10,
    "enableAnimation" BOOLEAN NOT NULL DEFAULT true,
    "autoReturn" BOOLEAN NOT NULL DEFAULT true,
    "excludedAgentIds" JSONB NOT NULL DEFAULT '[]',
    "defaultImamAgentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PrayerTimeSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyPrayerSchedule" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "prayerDate" DATE NOT NULL,
    "fajrTime" TEXT NOT NULL,
    "dhuhrTime" TEXT NOT NULL,
    "asrTime" TEXT NOT NULL,
    "maghribTime" TEXT NOT NULL,
    "ishaTime" TEXT NOT NULL,
    "imsakTime" TEXT,
    "sunriseTime" TEXT,
    "source" TEXT NOT NULL DEFAULT 'kemenag_astronomical',
    "cityName" TEXT,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyPrayerSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrayerSession" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "prayerName" TEXT NOT NULL,
    "prayerDate" DATE NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "participantCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PrayerSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrayerSessionParticipant" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "agentName" TEXT,
    "isImam" BOOLEAN NOT NULL DEFAULT false,
    "initialRoom" TEXT,
    "initialPosition" JSONB,
    "prayerPosition" JSONB,
    "status" TEXT NOT NULL DEFAULT 'INVITED',
    "arrivedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PrayerSessionParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BriefingSettings" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "startTime" TEXT NOT NULL DEFAULT '08:00',
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Jakarta',
    "durationMinutes" INTEGER NOT NULL DEFAULT 10,
    "preparationMinutes" INTEGER NOT NULL DEFAULT 2,
    "meetingLeaderId" TEXT,
    "participantMode" TEXT NOT NULL DEFAULT 'all',
    "excludedAgentIds" JSONB NOT NULL DEFAULT '[]',
    "autoReturn" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BriefingSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BriefingSession" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "scheduledDate" DATE NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "participantCount" INTEGER NOT NULL DEFAULT 0,
    "meetingLeaderId" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BriefingSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BriefingParticipant" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "agentName" TEXT,
    "isLeader" BOOLEAN NOT NULL DEFAULT false,
    "initialRoom" TEXT,
    "initialPosition" JSONB,
    "meetingPosition" JSONB,
    "status" TEXT NOT NULL DEFAULT 'INVITED',
    "arrivedAt" TIMESTAMP(3),
    "leftAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BriefingParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CompanyTax_organizationId_key" ON "CompanyTax"("organizationId");

-- CreateIndex
CREATE INDEX "CompanyTax_organizationId_idx" ON "CompanyTax"("organizationId");

-- CreateIndex
CREATE INDEX "CompanyDocument_organizationId_idx" ON "CompanyDocument"("organizationId");

-- CreateIndex
CREATE INDEX "CompanyDocument_organizationId_docType_idx" ON "CompanyDocument"("organizationId", "docType");

-- CreateIndex
CREATE INDEX "CompanyDocument_organizationId_status_idx" ON "CompanyDocument"("organizationId", "status");

-- CreateIndex
CREATE INDEX "CompanyDocument_uploadedById_idx" ON "CompanyDocument"("uploadedById");

-- CreateIndex
CREATE INDEX "Agent_organizationId_idx" ON "Agent"("organizationId");

-- CreateIndex
CREATE INDEX "Agent_organizationId_currentStatus_idx" ON "Agent"("organizationId", "currentStatus");

-- CreateIndex
CREATE UNIQUE INDEX "Agent_organizationId_name_key" ON "Agent"("organizationId", "name");

-- CreateIndex
CREATE INDEX "AgentTask_organizationId_idx" ON "AgentTask"("organizationId");

-- CreateIndex
CREATE INDEX "AgentTask_organizationId_status_idx" ON "AgentTask"("organizationId", "status");

-- CreateIndex
CREATE INDEX "AgentTask_agentId_idx" ON "AgentTask"("agentId");

-- CreateIndex
CREATE INDEX "TaskEvent_taskId_idx" ON "TaskEvent"("taskId");

-- CreateIndex
CREATE INDEX "TaskEvent_taskId_createdAt_idx" ON "TaskEvent"("taskId", "createdAt");

-- CreateIndex
CREATE INDEX "AgentMessage_conversationId_idx" ON "AgentMessage"("conversationId");

-- CreateIndex
CREATE INDEX "AgentMessage_taskId_idx" ON "AgentMessage"("taskId");

-- CreateIndex
CREATE INDEX "AgentActivity_agentId_idx" ON "AgentActivity"("agentId");

-- CreateIndex
CREATE INDEX "AgentActivity_agentId_startedAt_idx" ON "AgentActivity"("agentId", "startedAt");

-- CreateIndex
CREATE INDEX "Approval_organizationId_status_idx" ON "Approval"("organizationId", "status");

-- CreateIndex
CREATE INDEX "Approval_taskId_idx" ON "Approval"("taskId");

-- CreateIndex
CREATE UNIQUE INDEX "Role_organizationId_name_key" ON "Role"("organizationId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Permission_key_key" ON "Permission"("key");

-- CreateIndex
CREATE INDEX "Membership_organizationId_idx" ON "Membership"("organizationId");

-- CreateIndex
CREATE INDEX "Membership_userId_idx" ON "Membership"("userId");

-- CreateIndex
CREATE INDEX "Membership_departmentId_idx" ON "Membership"("departmentId");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_userId_organizationId_key" ON "Membership"("userId", "organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "UserEmployment_membershipId_key" ON "UserEmployment"("membershipId");

-- CreateIndex
CREATE INDEX "UserEmployment_employeeId_idx" ON "UserEmployment"("employeeId");

-- CreateIndex
CREATE INDEX "UserCustomFieldDef_organizationId_idx" ON "UserCustomFieldDef"("organizationId");

-- CreateIndex
CREATE INDEX "UserCustomValue_membershipId_idx" ON "UserCustomValue"("membershipId");

-- CreateIndex
CREATE UNIQUE INDEX "UserCustomValue_membershipId_fieldDefId_key" ON "UserCustomValue"("membershipId", "fieldDefId");

-- CreateIndex
CREATE INDEX "UserModuleAccess_membershipId_idx" ON "UserModuleAccess"("membershipId");

-- CreateIndex
CREATE UNIQUE INDEX "UserModuleAccess_membershipId_moduleKey_key" ON "UserModuleAccess"("membershipId", "moduleKey");

-- CreateIndex
CREATE INDEX "Department_organizationId_idx" ON "Department"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Department_organizationId_name_key" ON "Department"("organizationId", "name");

-- CreateIndex
CREATE INDEX "Channel_organizationId_idx" ON "Channel"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Channel_organizationId_type_key" ON "Channel"("organizationId", "type");

-- CreateIndex
CREATE INDEX "ChannelAccount_organizationId_idx" ON "ChannelAccount"("organizationId");

-- CreateIndex
CREATE INDEX "Customer_organizationId_idx" ON "Customer"("organizationId");

-- CreateIndex
CREATE INDEX "Customer_organizationId_stage_idx" ON "Customer"("organizationId", "stage");

-- CreateIndex
CREATE INDEX "Customer_phone_idx" ON "Customer"("phone");

-- CreateIndex
CREATE INDEX "Customer_email_idx" ON "Customer"("email");

-- CreateIndex
CREATE INDEX "Customer_ownerId_idx" ON "Customer"("ownerId");

-- CreateIndex
CREATE INDEX "Customer_updatedAt_idx" ON "Customer"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_organizationId_name_key" ON "Tag"("organizationId", "name");

-- CreateIndex
CREATE INDEX "Conversation_organizationId_idx" ON "Conversation"("organizationId");

-- CreateIndex
CREATE INDEX "Conversation_customerId_idx" ON "Conversation"("customerId");

-- CreateIndex
CREATE INDEX "Conversation_organizationId_status_idx" ON "Conversation"("organizationId", "status");

-- CreateIndex
CREATE INDEX "Conversation_lastMessageAt_idx" ON "Conversation"("lastMessageAt");

-- CreateIndex
CREATE INDEX "ConversationMessage_conversationId_idx" ON "ConversationMessage"("conversationId");

-- CreateIndex
CREATE INDEX "ConversationMessage_createdAt_idx" ON "ConversationMessage"("createdAt");

-- CreateIndex
CREATE INDEX "Note_customerId_idx" ON "Note"("customerId");

-- CreateIndex
CREATE INDEX "Activity_organizationId_idx" ON "Activity"("organizationId");

-- CreateIndex
CREATE INDEX "Activity_customerId_idx" ON "Activity"("customerId");

-- CreateIndex
CREATE INDEX "Activity_createdAt_idx" ON "Activity"("createdAt");

-- CreateIndex
CREATE INDEX "LeadStage_organizationId_idx" ON "LeadStage"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "LeadStage_organizationId_name_key" ON "LeadStage"("organizationId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Lead_customerId_key" ON "Lead"("customerId");

-- CreateIndex
CREATE INDEX "Lead_organizationId_idx" ON "Lead"("organizationId");

-- CreateIndex
CREATE INDEX "Lead_stageId_idx" ON "Lead"("stageId");

-- CreateIndex
CREATE UNIQUE INDEX "DealStage_organizationId_name_key" ON "DealStage"("organizationId", "name");

-- CreateIndex
CREATE INDEX "Deal_organizationId_idx" ON "Deal"("organizationId");

-- CreateIndex
CREATE INDEX "FollowUp_organizationId_idx" ON "FollowUp"("organizationId");

-- CreateIndex
CREATE INDEX "FollowUp_scheduledAt_idx" ON "FollowUp"("scheduledAt");

-- CreateIndex
CREATE INDEX "FollowUp_status_idx" ON "FollowUp"("status");

-- CreateIndex
CREATE INDEX "Campaign_organizationId_idx" ON "Campaign"("organizationId");

-- CreateIndex
CREATE INDEX "Campaign_status_idx" ON "Campaign"("status");

-- CreateIndex
CREATE INDEX "CampaignRecipient_campaignId_idx" ON "CampaignRecipient"("campaignId");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignRecipient_campaignId_phone_key" ON "CampaignRecipient"("campaignId", "phone");

-- CreateIndex
CREATE INDEX "BotFlow_organizationId_idx" ON "BotFlow"("organizationId");

-- CreateIndex
CREATE INDEX "BotNode_flowId_idx" ON "BotNode"("flowId");

-- CreateIndex
CREATE INDEX "AuditLog_organizationId_idx" ON "AuditLog"("organizationId");

-- CreateIndex
CREATE INDEX "AuditLog_organizationId_createdAt_idx" ON "AuditLog"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");

-- CreateIndex
CREATE INDEX "AuditLog_module_idx" ON "AuditLog"("module");

-- CreateIndex
CREATE INDEX "Notification_userId_isRead_idx" ON "Notification"("userId", "isRead");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenId_key" ON "Session"("tokenId");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Invitation_token_key" ON "Invitation"("token");

-- CreateIndex
CREATE UNIQUE INDEX "Invitation_organizationId_email_key" ON "Invitation"("organizationId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_organizationId_key" ON "Subscription"("organizationId");

-- CreateIndex
CREATE INDEX "Subscription_status_idx" ON "Subscription"("status");

-- CreateIndex
CREATE INDEX "SubscriptionModule_subscriptionId_idx" ON "SubscriptionModule"("subscriptionId");

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionModule_subscriptionId_moduleKey_key" ON "SubscriptionModule"("subscriptionId", "moduleKey");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_number_key" ON "Invoice"("number");

-- CreateIndex
CREATE INDEX "Invoice_organizationId_idx" ON "Invoice"("organizationId");

-- CreateIndex
CREATE INDEX "Invoice_status_idx" ON "Invoice"("status");

-- CreateIndex
CREATE INDEX "InvoiceItem_invoiceId_idx" ON "InvoiceItem"("invoiceId");

-- CreateIndex
CREATE INDEX "ReplyTemplate_organizationId_idx" ON "ReplyTemplate"("organizationId");

-- CreateIndex
CREATE INDEX "ReplyTemplate_organizationId_isActive_idx" ON "ReplyTemplate"("organizationId", "isActive");

-- CreateIndex
CREATE INDEX "HrVacancy_organizationId_idx" ON "HrVacancy"("organizationId");

-- CreateIndex
CREATE INDEX "HrVacancy_organizationId_status_idx" ON "HrVacancy"("organizationId", "status");

-- CreateIndex
CREATE INDEX "HrCandidate_organizationId_idx" ON "HrCandidate"("organizationId");

-- CreateIndex
CREATE INDEX "HrCandidate_organizationId_stage_idx" ON "HrCandidate"("organizationId", "stage");

-- CreateIndex
CREATE INDEX "HrCandidate_vacancyId_idx" ON "HrCandidate"("vacancyId");

-- CreateIndex
CREATE UNIQUE INDEX "HrEmployee_candidateId_key" ON "HrEmployee"("candidateId");

-- CreateIndex
CREATE INDEX "HrEmployee_organizationId_idx" ON "HrEmployee"("organizationId");

-- CreateIndex
CREATE INDEX "HrEmployee_organizationId_status_idx" ON "HrEmployee"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "HrEmployee_organizationId_employeeNo_key" ON "HrEmployee"("organizationId", "employeeNo");

-- CreateIndex
CREATE INDEX "HrContract_organizationId_idx" ON "HrContract"("organizationId");

-- CreateIndex
CREATE INDEX "HrContract_employeeId_idx" ON "HrContract"("employeeId");

-- CreateIndex
CREATE INDEX "HrContract_organizationId_status_idx" ON "HrContract"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "HrContract_organizationId_contractNo_key" ON "HrContract"("organizationId", "contractNo");

-- CreateIndex
CREATE UNIQUE INDEX "BotConfig_organizationId_key" ON "BotConfig"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "CreditLedger_reference_key" ON "CreditLedger"("reference");

-- CreateIndex
CREATE INDEX "CreditLedger_organizationId_createdAt_idx" ON "CreditLedger"("organizationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "BotUsage_messageId_key" ON "BotUsage"("messageId");

-- CreateIndex
CREATE INDEX "BotUsage_organizationId_createdAt_idx" ON "BotUsage"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "TopUpRequest_organizationId_status_idx" ON "TopUpRequest"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "MasterLedger_reference_key" ON "MasterLedger"("reference");

-- CreateIndex
CREATE INDEX "MasterLedger_createdAt_idx" ON "MasterLedger"("createdAt");

-- CreateIndex
CREATE INDEX "MasterLedger_organizationId_createdAt_idx" ON "MasterLedger"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "OfficeLayout_organizationId_idx" ON "OfficeLayout"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "OfficeLayout_organizationId_agentId_key" ON "OfficeLayout"("organizationId", "agentId");

-- CreateIndex
CREATE INDEX "EsignDocument_organizationId_idx" ON "EsignDocument"("organizationId");

-- CreateIndex
CREATE INDEX "EsignDocument_organizationId_status_idx" ON "EsignDocument"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "EsignDocument_organizationId_documentNumber_key" ON "EsignDocument"("organizationId", "documentNumber");

-- CreateIndex
CREATE UNIQUE INDEX "EsignSigner_accessToken_key" ON "EsignSigner"("accessToken");

-- CreateIndex
CREATE INDEX "EsignSigner_documentId_idx" ON "EsignSigner"("documentId");

-- CreateIndex
CREATE INDEX "EsignSigner_userId_idx" ON "EsignSigner"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "EsignSigner_documentId_userId_key" ON "EsignSigner"("documentId", "userId");

-- CreateIndex
CREATE INDEX "EsignSignature_documentId_idx" ON "EsignSignature"("documentId");

-- CreateIndex
CREATE INDEX "EsignSignature_signerId_idx" ON "EsignSignature"("signerId");

-- CreateIndex
CREATE INDEX "EsignWaSignSession_organizationId_idx" ON "EsignWaSignSession"("organizationId");

-- CreateIndex
CREATE INDEX "EsignWaSignSession_expiresAt_idx" ON "EsignWaSignSession"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "EsignWaSignSession_userId_organizationId_key" ON "EsignWaSignSession"("userId", "organizationId");

-- CreateIndex
CREATE INDEX "EsignTemplate_organizationId_idx" ON "EsignTemplate"("organizationId");

-- CreateIndex
CREATE INDEX "EsignAuditLog_documentId_createdAt_idx" ON "EsignAuditLog"("documentId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "EsignNotification_documentId_signerId_eventType_key" ON "EsignNotification"("documentId", "signerId", "eventType");

-- CreateIndex
CREATE INDEX "QuranBookmark_organizationId_userId_idx" ON "QuranBookmark"("organizationId", "userId");

-- CreateIndex
CREATE INDEX "QuranBookmark_userId_surahId_ayahNumber_idx" ON "QuranBookmark"("userId", "surahId", "ayahNumber");

-- CreateIndex
CREATE UNIQUE INDEX "PrayerUserSetting_userId_key" ON "PrayerUserSetting"("userId");

-- CreateIndex
CREATE INDEX "PrayerUserSetting_organizationId_idx" ON "PrayerUserSetting"("organizationId");

-- CreateIndex
CREATE INDEX "GoldPriceHistory_organizationId_priceDate_idx" ON "GoldPriceHistory"("organizationId", "priceDate");

-- CreateIndex
CREATE UNIQUE INDEX "GoldPriceHistory_organizationId_priceDate_key" ON "GoldPriceHistory"("organizationId", "priceDate");

-- CreateIndex
CREATE INDEX "Simulation_organizationId_userId_createdAt_idx" ON "Simulation"("organizationId", "userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "GoldSetting_organizationId_key_key" ON "GoldSetting"("organizationId", "key");

-- CreateIndex
CREATE INDEX "KirimUrl_organizationId_scope_idx" ON "KirimUrl"("organizationId", "scope");

-- CreateIndex
CREATE INDEX "Announcement_organizationId_status_idx" ON "Announcement"("organizationId", "status");

-- CreateIndex
CREATE INDEX "Announcement_organizationId_createdAt_idx" ON "Announcement"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "Announcement_organizationId_scheduledAt_idx" ON "Announcement"("organizationId", "scheduledAt");

-- CreateIndex
CREATE INDEX "NotificationPreference_organizationId_idx" ON "NotificationPreference"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationPreference_organizationId_userId_key" ON "NotificationPreference"("organizationId", "userId");

-- CreateIndex
CREATE INDEX "TalTask_organizationId_userId_year_month_idx" ON "TalTask"("organizationId", "userId", "year", "month");

-- CreateIndex
CREATE INDEX "TalTask_organizationId_userId_taskDate_idx" ON "TalTask"("organizationId", "userId", "taskDate");

-- CreateIndex
CREATE INDEX "TalTask_organizationId_userId_weekYear_weekNumber_idx" ON "TalTask"("organizationId", "userId", "weekYear", "weekNumber");

-- CreateIndex
CREATE INDEX "TalTask_organizationId_status_idx" ON "TalTask"("organizationId", "status");

-- CreateIndex
CREATE INDEX "TalRoutineTemplate_organizationId_userId_idx" ON "TalRoutineTemplate"("organizationId", "userId");

-- CreateIndex
CREATE INDEX "TalRoutineTemplate_organizationId_isPreset_idx" ON "TalRoutineTemplate"("organizationId", "isPreset");

-- CreateIndex
CREATE INDEX "TalMonthlyLock_organizationId_year_month_idx" ON "TalMonthlyLock"("organizationId", "year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "TalMonthlyLock_organizationId_userId_year_month_key" ON "TalMonthlyLock"("organizationId", "userId", "year", "month");

-- CreateIndex
CREATE INDEX "TalLockReport_organizationId_userId_scope_idx" ON "TalLockReport"("organizationId", "userId", "scope");

-- CreateIndex
CREATE INDEX "TalLockReport_organizationId_scope_scopeKey_idx" ON "TalLockReport"("organizationId", "scope", "scopeKey");

-- CreateIndex
CREATE UNIQUE INDEX "TalLockReport_organizationId_scope_scopeKey_userId_key" ON "TalLockReport"("organizationId", "scope", "scopeKey", "userId");

-- CreateIndex
CREATE INDEX "TalCuti_organizationId_cutiDate_idx" ON "TalCuti"("organizationId", "cutiDate");

-- CreateIndex
CREATE UNIQUE INDEX "TalCuti_organizationId_userId_cutiDate_key" ON "TalCuti"("organizationId", "userId", "cutiDate");

-- CreateIndex
CREATE INDEX "TalHoliday_organizationId_idx" ON "TalHoliday"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "TalHoliday_organizationId_holidayDate_key" ON "TalHoliday"("organizationId", "holidayDate");

-- CreateIndex
CREATE INDEX "TalBadge_organizationId_idx" ON "TalBadge"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "TalBadge_organizationId_badgeId_key" ON "TalBadge"("organizationId", "badgeId");

-- CreateIndex
CREATE INDEX "UserBadgeProgress_organizationId_userId_seasonYear_idx" ON "UserBadgeProgress"("organizationId", "userId", "seasonYear");

-- CreateIndex
CREATE UNIQUE INDEX "UserBadgeProgress_organizationId_userId_badgeId_seasonYear_key" ON "UserBadgeProgress"("organizationId", "userId", "badgeId", "seasonYear");

-- CreateIndex
CREATE INDEX "UserTrophy_organizationId_userId_createdAt_idx" ON "UserTrophy"("organizationId", "userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "TalSetting_organizationId_key_key" ON "TalSetting"("organizationId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "TalDeadlineSetting_organizationId_key" ON "TalDeadlineSetting"("organizationId");

-- CreateIndex
CREATE INDEX "TalUserObligation_organizationId_idx" ON "TalUserObligation"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "TalUserObligation_organizationId_userId_key" ON "TalUserObligation"("organizationId", "userId");

-- CreateIndex
CREATE INDEX "TalTeamVisibility_organizationId_viewerId_idx" ON "TalTeamVisibility"("organizationId", "viewerId");

-- CreateIndex
CREATE INDEX "TalTeamVisibility_organizationId_targetId_idx" ON "TalTeamVisibility"("organizationId", "targetId");

-- CreateIndex
CREATE UNIQUE INDEX "TalTeamVisibility_organizationId_viewerId_targetId_key" ON "TalTeamVisibility"("organizationId", "viewerId", "targetId");

-- CreateIndex
CREATE INDEX "TalAuditLog_organizationId_createdAt_idx" ON "TalAuditLog"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "TalAuditLog_organizationId_actionType_idx" ON "TalAuditLog"("organizationId", "actionType");

-- CreateIndex
CREATE INDEX "KoperasiAnggota_organizationId_namaLengkap_idx" ON "KoperasiAnggota"("organizationId", "namaLengkap");

-- CreateIndex
CREATE INDEX "KoperasiAnggota_organizationId_cabang_idx" ON "KoperasiAnggota"("organizationId", "cabang");

-- CreateIndex
CREATE UNIQUE INDEX "KoperasiAnggota_organizationId_nik_key" ON "KoperasiAnggota"("organizationId", "nik");

-- CreateIndex
CREATE UNIQUE INDEX "KoperasiSetting_organizationId_key_key" ON "KoperasiSetting"("organizationId", "key");

-- CreateIndex
CREATE INDEX "Ticket_organizationId_status_idx" ON "Ticket"("organizationId", "status");

-- CreateIndex
CREATE INDEX "Ticket_organizationId_createdAt_idx" ON "Ticket"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "Ticket_createdById_idx" ON "Ticket"("createdById");

-- CreateIndex
CREATE INDEX "Ticket_assignedToId_idx" ON "Ticket"("assignedToId");

-- CreateIndex
CREATE INDEX "TicketReply_ticketId_createdAt_idx" ON "TicketReply"("ticketId", "createdAt");

-- CreateIndex
CREATE INDEX "ArchiveCategory_organizationId_idx" ON "ArchiveCategory"("organizationId");

-- CreateIndex
CREATE INDEX "ArchiveCategory_organizationId_parentId_idx" ON "ArchiveCategory"("organizationId", "parentId");

-- CreateIndex
CREATE INDEX "ArchiveDocument_organizationId_idx" ON "ArchiveDocument"("organizationId");

-- CreateIndex
CREATE INDEX "ArchiveDocument_organizationId_categoryId_idx" ON "ArchiveDocument"("organizationId", "categoryId");

-- CreateIndex
CREATE INDEX "ArchiveDocument_organizationId_status_idx" ON "ArchiveDocument"("organizationId", "status");

-- CreateIndex
CREATE INDEX "ArchiveDocument_organizationId_confidentiality_idx" ON "ArchiveDocument"("organizationId", "confidentiality");

-- CreateIndex
CREATE INDEX "ArchiveDocument_organizationId_uploadedAt_idx" ON "ArchiveDocument"("organizationId", "uploadedAt");

-- CreateIndex
CREATE INDEX "ArchiveDocument_uploaderId_idx" ON "ArchiveDocument"("uploaderId");

-- CreateIndex
CREATE UNIQUE INDEX "Meeting_roomName_key" ON "Meeting"("roomName");

-- CreateIndex
CREATE INDEX "Meeting_organizationId_startsAt_idx" ON "Meeting"("organizationId", "startsAt");

-- CreateIndex
CREATE INDEX "Meeting_organizationId_status_idx" ON "Meeting"("organizationId", "status");

-- CreateIndex
CREATE INDEX "Meeting_hostId_idx" ON "Meeting"("hostId");

-- CreateIndex
CREATE INDEX "MeetingParticipant_meetingId_idx" ON "MeetingParticipant"("meetingId");

-- CreateIndex
CREATE INDEX "MeetingParticipant_userId_idx" ON "MeetingParticipant"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "MeetingParticipant_meetingId_userId_key" ON "MeetingParticipant"("meetingId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "MeetingGuestToken_participantId_key" ON "MeetingGuestToken"("participantId");

-- CreateIndex
CREATE UNIQUE INDEX "MeetingGuestToken_accessToken_key" ON "MeetingGuestToken"("accessToken");

-- CreateIndex
CREATE INDEX "MeetingGuestToken_meetingId_idx" ON "MeetingGuestToken"("meetingId");

-- CreateIndex
CREATE INDEX "MeetingSession_meetingId_idx" ON "MeetingSession"("meetingId");

-- CreateIndex
CREATE INDEX "MeetingChatMessage_meetingId_createdAt_idx" ON "MeetingChatMessage"("meetingId", "createdAt");

-- CreateIndex
CREATE INDEX "MeetingRecording_meetingId_idx" ON "MeetingRecording"("meetingId");

-- CreateIndex
CREATE UNIQUE INDEX "MeetingSetting_organizationId_key" ON "MeetingSetting"("organizationId");

-- CreateIndex
CREATE INDEX "MeetingAgendaItem_meetingId_idx" ON "MeetingAgendaItem"("meetingId");

-- CreateIndex
CREATE INDEX "MeetingNote_meetingId_idx" ON "MeetingNote"("meetingId");

-- CreateIndex
CREATE INDEX "CalendarEvent_organizationId_startAt_idx" ON "CalendarEvent"("organizationId", "startAt");

-- CreateIndex
CREATE INDEX "CalendarEvent_organizationId_status_idx" ON "CalendarEvent"("organizationId", "status");

-- CreateIndex
CREATE INDEX "CalendarEvent_createdById_idx" ON "CalendarEvent"("createdById");

-- CreateIndex
CREATE INDEX "CalendarEvent_recurrenceParentId_idx" ON "CalendarEvent"("recurrenceParentId");

-- CreateIndex
CREATE UNIQUE INDEX "CalendarEvent_sourceModule_sourceRecordId_key" ON "CalendarEvent"("sourceModule", "sourceRecordId");

-- CreateIndex
CREATE INDEX "CalendarAttendee_userId_idx" ON "CalendarAttendee"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "CalendarAttendee_eventId_userId_key" ON "CalendarAttendee"("eventId", "userId");

-- CreateIndex
CREATE INDEX "CalendarReminder_remindAt_deliveryStatus_idx" ON "CalendarReminder"("remindAt", "deliveryStatus");

-- CreateIndex
CREATE INDEX "CalendarReminder_userId_idx" ON "CalendarReminder"("userId");

-- CreateIndex
CREATE INDEX "CalendarSyncLog_sourceModule_sourceRecordId_idx" ON "CalendarSyncLog"("sourceModule", "sourceRecordId");

-- CreateIndex
CREATE INDEX "CalendarSyncLog_organizationId_lastSyncedAt_idx" ON "CalendarSyncLog"("organizationId", "lastSyncedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CalendarUserPreference_userId_organizationId_key" ON "CalendarUserPreference"("userId", "organizationId");

-- CreateIndex
CREATE INDEX "DailyWorkNote_organizationId_userId_idx" ON "DailyWorkNote"("organizationId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "DailyWorkNote_organizationId_userId_date_key" ON "DailyWorkNote"("organizationId", "userId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "DailyWorkspacePreference_organizationId_userId_key" ON "DailyWorkspacePreference"("organizationId", "userId");

-- CreateIndex
CREATE INDEX "AttendanceLocation_organizationId_isActive_idx" ON "AttendanceLocation"("organizationId", "isActive");

-- CreateIndex
CREATE INDEX "Shift_organizationId_isActive_idx" ON "Shift"("organizationId", "isActive");

-- CreateIndex
CREATE INDEX "WorkSchedule_organizationId_userId_idx" ON "WorkSchedule"("organizationId", "userId");

-- CreateIndex
CREATE INDEX "WorkSchedule_organizationId_departmentId_idx" ON "WorkSchedule"("organizationId", "departmentId");

-- CreateIndex
CREATE INDEX "AttendanceRecord_organizationId_userId_idx" ON "AttendanceRecord"("organizationId", "userId");

-- CreateIndex
CREATE INDEX "AttendanceRecord_organizationId_date_idx" ON "AttendanceRecord"("organizationId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "AttendanceRecord_organizationId_userId_date_key" ON "AttendanceRecord"("organizationId", "userId", "date");

-- CreateIndex
CREATE INDEX "AttendanceCorrection_organizationId_recordId_idx" ON "AttendanceCorrection"("organizationId", "recordId");

-- CreateIndex
CREATE INDEX "AttendanceCorrection_organizationId_status_idx" ON "AttendanceCorrection"("organizationId", "status");

-- CreateIndex
CREATE INDEX "OvertimeRequest_organizationId_userId_idx" ON "OvertimeRequest"("organizationId", "userId");

-- CreateIndex
CREATE INDEX "OvertimeRequest_organizationId_status_idx" ON "OvertimeRequest"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "AttendanceSetting_organizationId_key" ON "AttendanceSetting"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "PrayerTimeSettings_organizationId_key" ON "PrayerTimeSettings"("organizationId");

-- CreateIndex
CREATE INDEX "DailyPrayerSchedule_organizationId_prayerDate_idx" ON "DailyPrayerSchedule"("organizationId", "prayerDate");

-- CreateIndex
CREATE UNIQUE INDEX "DailyPrayerSchedule_organizationId_prayerDate_key" ON "DailyPrayerSchedule"("organizationId", "prayerDate");

-- CreateIndex
CREATE INDEX "PrayerSession_organizationId_prayerDate_idx" ON "PrayerSession"("organizationId", "prayerDate");

-- CreateIndex
CREATE UNIQUE INDEX "PrayerSession_organizationId_prayerDate_prayerName_key" ON "PrayerSession"("organizationId", "prayerDate", "prayerName");

-- CreateIndex
CREATE INDEX "PrayerSessionParticipant_sessionId_idx" ON "PrayerSessionParticipant"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "PrayerSessionParticipant_sessionId_agentId_key" ON "PrayerSessionParticipant"("sessionId", "agentId");

-- CreateIndex
CREATE UNIQUE INDEX "BriefingSettings_organizationId_key" ON "BriefingSettings"("organizationId");

-- CreateIndex
CREATE INDEX "BriefingSession_organizationId_scheduledDate_idx" ON "BriefingSession"("organizationId", "scheduledDate");

-- CreateIndex
CREATE UNIQUE INDEX "BriefingSession_organizationId_scheduledDate_key" ON "BriefingSession"("organizationId", "scheduledDate");

-- CreateIndex
CREATE INDEX "BriefingParticipant_sessionId_idx" ON "BriefingParticipant"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "BriefingParticipant_sessionId_agentId_key" ON "BriefingParticipant"("sessionId", "agentId");

-- AddForeignKey
ALTER TABLE "AgentTask" ADD CONSTRAINT "AgentTask_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskEvent" ADD CONSTRAINT "TaskEvent_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "AgentTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentMessage" ADD CONSTRAINT "AgentMessage_receiverAgentId_fkey" FOREIGN KEY ("receiverAgentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentMessage" ADD CONSTRAINT "AgentMessage_senderAgentId_fkey" FOREIGN KEY ("senderAgentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentMessage" ADD CONSTRAINT "AgentMessage_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "AgentTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentActivity" ADD CONSTRAINT "AgentActivity_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_requestedByAgentId_fkey" FOREIGN KEY ("requestedByAgentId") REFERENCES "Agent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "AgentTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserEmployment" ADD CONSTRAINT "UserEmployment_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "Membership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserCustomValue" ADD CONSTRAINT "UserCustomValue_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "Membership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserCustomValue" ADD CONSTRAINT "UserCustomValue_fieldDefId_fkey" FOREIGN KEY ("fieldDefId") REFERENCES "UserCustomFieldDef"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserModuleAccess" ADD CONSTRAINT "UserModuleAccess_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "Membership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChannelAccount" ADD CONSTRAINT "ChannelAccount_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerTag" ADD CONSTRAINT "CustomerTag_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerTag" ADD CONSTRAINT "CustomerTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationMessage" ADD CONSTRAINT "ConversationMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "LeadStage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "DealStage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FollowUp" ADD CONSTRAINT "FollowUp_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignRecipient" ADD CONSTRAINT "CampaignRecipient_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignRecipient" ADD CONSTRAINT "CampaignRecipient_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BotNode" ADD CONSTRAINT "BotNode_flowId_fkey" FOREIGN KEY ("flowId") REFERENCES "BotFlow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionModule" ADD CONSTRAINT "SubscriptionModule_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceItem" ADD CONSTRAINT "InvoiceItem_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HrCandidate" ADD CONSTRAINT "HrCandidate_vacancyId_fkey" FOREIGN KEY ("vacancyId") REFERENCES "HrVacancy"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HrEmployee" ADD CONSTRAINT "HrEmployee_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "HrCandidate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HrContract" ADD CONSTRAINT "HrContract_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "HrEmployee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfficeLayout" ADD CONSTRAINT "OfficeLayout_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EsignSigner" ADD CONSTRAINT "EsignSigner_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "EsignDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EsignSignature" ADD CONSTRAINT "EsignSignature_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "EsignDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EsignSignature" ADD CONSTRAINT "EsignSignature_signerId_fkey" FOREIGN KEY ("signerId") REFERENCES "EsignSigner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EsignAuditLog" ADD CONSTRAINT "EsignAuditLog_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "EsignDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EsignNotification" ADD CONSTRAINT "EsignNotification_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "EsignDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EsignNotification" ADD CONSTRAINT "EsignNotification_signerId_fkey" FOREIGN KEY ("signerId") REFERENCES "EsignSigner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TalTask" ADD CONSTRAINT "TalTask_originalTaskId_fkey" FOREIGN KEY ("originalTaskId") REFERENCES "TalTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TalTask" ADD CONSTRAINT "TalTask_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "TalTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketReply" ADD CONSTRAINT "TicketReply_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArchiveCategory" ADD CONSTRAINT "ArchiveCategory_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "ArchiveCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArchiveDocument" ADD CONSTRAINT "ArchiveDocument_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ArchiveCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingParticipant" ADD CONSTRAINT "MeetingParticipant_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingGuestToken" ADD CONSTRAINT "MeetingGuestToken_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingGuestToken" ADD CONSTRAINT "MeetingGuestToken_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "MeetingParticipant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingSession" ADD CONSTRAINT "MeetingSession_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingChatMessage" ADD CONSTRAINT "MeetingChatMessage_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingRecording" ADD CONSTRAINT "MeetingRecording_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingAgendaItem" ADD CONSTRAINT "MeetingAgendaItem_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingNote" ADD CONSTRAINT "MeetingNote_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_recurrenceParentId_fkey" FOREIGN KEY ("recurrenceParentId") REFERENCES "CalendarEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarAttendee" ADD CONSTRAINT "CalendarAttendee_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "CalendarEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarReminder" ADD CONSTRAINT "CalendarReminder_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "CalendarEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarSyncLog" ADD CONSTRAINT "CalendarSyncLog_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "CalendarEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkSchedule" ADD CONSTRAINT "WorkSchedule_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "Shift"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "WorkSchedule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "AttendanceLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceCorrection" ADD CONSTRAINT "AttendanceCorrection_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "AttendanceRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceSetting" ADD CONSTRAINT "AttendanceSetting_defaultLocationId_fkey" FOREIGN KEY ("defaultLocationId") REFERENCES "AttendanceLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrayerSessionParticipant" ADD CONSTRAINT "PrayerSessionParticipant_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "PrayerSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BriefingParticipant" ADD CONSTRAINT "BriefingParticipant_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "BriefingSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

