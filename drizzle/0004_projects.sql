CREATE TABLE `projects` (
  `id` int AUTO_INCREMENT NOT NULL,
  `userId` int NOT NULL,
  `name` varchar(500) NOT NULL,
  `context` text,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `projects_id` PRIMARY KEY(`id`),
  CONSTRAINT `projects_user_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE
);

ALTER TABLE `conversations` ADD `projectId` int;
ALTER TABLE `conversations` ADD CONSTRAINT `conversations_project_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE SET NULL;

CREATE INDEX `conversations_project_idx` ON `conversations` (`projectId`);
