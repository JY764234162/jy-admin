
-- MySQL dump 10.13  Distrib 8.0.45, for Linux (aarch64)
--
-- Host: localhost    Database: jy_admin
-- ------------------------------------------------------
-- Server version	8.0.45

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;
SET @MYSQLDUMP_TEMP_LOG_BIN = @@SESSION.SQL_LOG_BIN;
SET @@SESSION.SQL_LOG_BIN= 0;

--
-- GTID state at the beginning of the backup 
--

SET @@GLOBAL.GTID_PURGED=/*!80000 '+'*/ '5c883786-f66a-11f0-80ad-928fc9f63b95:1-39';

--
-- Table structure for table `customers`
--

DROP TABLE IF EXISTS `customers`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `customers` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `created_at` datetime(3) DEFAULT NULL,
  `updated_at` datetime(3) DEFAULT NULL,
  `deleted_at` datetime(3) DEFAULT NULL,
  `customer_name` longtext COMMENT '客户名',
  `customer_phone` longtext COMMENT '客户手机号',
  `customer_status` longtext COMMENT '客户状态',
  PRIMARY KEY (`id`),
  KEY `idx_customers_deleted_at` (`deleted_at`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `customers`
--

LOCK TABLES `customers` WRITE;
/*!40000 ALTER TABLE `customers` DISABLE KEYS */;
INSERT INTO `customers` VALUES (1,'2026-01-04 11:54:47.061','2026-01-04 11:54:47.061',NULL,'6','123','');
/*!40000 ALTER TABLE `customers` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `exa_file_upload_and_downloads`
--

DROP TABLE IF EXISTS `exa_file_upload_and_downloads`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `exa_file_upload_and_downloads` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `created_at` datetime(3) DEFAULT NULL,
  `updated_at` datetime(3) DEFAULT NULL,
  `deleted_at` datetime(3) DEFAULT NULL,
  `name` longtext COMMENT '文件名',
  `class_id` bigint DEFAULT '0' COMMENT '分类id',
  `url` longtext COMMENT '文件地址',
  `tag` longtext COMMENT '文件标签',
  `key` longtext COMMENT '编号',
  PRIMARY KEY (`id`),
  KEY `idx_exa_file_upload_and_downloads_deleted_at` (`deleted_at`)
) ENGINE=InnoDB AUTO_INCREMENT=29 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `exa_file_upload_and_downloads`
--

LOCK TABLES `exa_file_upload_and_downloads` WRITE;
/*!40000 ALTER TABLE `exa_file_upload_and_downloads` DISABLE KEYS */;
/*!40000 ALTER TABLE `exa_file_upload_and_downloads` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `jwt_blacklists`
--

DROP TABLE IF EXISTS `jwt_blacklists`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `jwt_blacklists` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `created_at` datetime(3) DEFAULT NULL,
  `updated_at` datetime(3) DEFAULT NULL,
  `deleted_at` datetime(3) DEFAULT NULL,
  `jwt` text COMMENT 'jwt',
  PRIMARY KEY (`id`),
  KEY `idx_jwt_blacklists_deleted_at` (`deleted_at`)
) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `jwt_blacklists`
--

LOCK TABLES `jwt_blacklists` WRITE;
/*!40000 ALTER TABLE `jwt_blacklists` DISABLE KEYS */;
INSERT INTO `jwt_blacklists` VALUES (1,'2026-01-21 10:30:11.587','2026-01-21 10:30:11.587','2026-01-27 01:42:09.511','Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJJRCI6MSwiVXNlcm5hbWUiOiJhZG1pbiIsIk5pY2tOYW1lIjoi6LaF57qn566h55CG5ZGYIiwiQXV0aG9yaXR5SWQiOiI4ODgiLCJCdWZmZXJUaW1lIjo4NjQwMCwiaXNzIjoiSlktQWRtaW4iLCJhdWQiOlsiR1ZBIl0sImV4cCI6MTc2OTU2NTUzMywibmJmIjoxNzY4OTYwNzMzfQ.04sCVPKV-C659M1m5CLCKhADTFQ9M97Nbdi_2IXeLjw'),(2,'2026-01-27 09:42:40.808','2026-01-27 09:42:40.808',NULL,'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJJRCI6MSwiVXNlcm5hbWUiOiJhZG1pbiIsIk5pY2tOYW1lIjoi6LaF57qn566h55CG5ZGYIiwiQXV0aG9yaXR5SWQiOiI4ODgiLCJCdWZmZXJUaW1lIjo4NjQwMCwiaXNzIjoiSlktQWRtaW4tUHJvZHVjdGlvbiIsImF1ZCI6WyJHVkEiXSwiZXhwIjoxNzcwMDgyNzM4LCJuYmYiOjE3Njk0Nzc5Mzh9.I0F5mmzqJcKsmIN6vIqYoE2vwMJkiAtd5fxtB5NoKDE'),(3,'2026-01-27 09:43:57.304','2026-01-27 09:43:57.304',NULL,'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJJRCI6MSwiVXNlcm5hbWUiOiJhZG1pbiIsIk5pY2tOYW1lIjoi6LaF57qn566h55CG5ZGYIiwiQXV0aG9yaXR5SWQiOiI4ODgiLCJCdWZmZXJUaW1lIjo4NjQwMCwiaXNzIjoiSlktQWRtaW4tUHJvZHVjdGlvbiIsImF1ZCI6WyJHVkEiXSwiZXhwIjoxNzcwMDgyOTg5LCJuYmYiOjE3Njk0NzgxODl9.6oOXntkrC5SEQ19QXjiXcp_xkuspRptTA8eWpqOoSJ8'),(4,'2026-01-27 09:44:16.112','2026-01-27 09:44:16.112',NULL,'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJJRCI6MiwiVXNlcm5hbWUiOiJndWVzdCIsIk5pY2tOYW1lIjoi5ri45a6iIiwiQXV0aG9yaXR5SWQiOiI2NjYiLCJCdWZmZXJUaW1lIjo4NjQwMCwiaXNzIjoiSlktQWRtaW4tUHJvZHVjdGlvbiIsImF1ZCI6WyJHVkEiXSwiZXhwIjoxNzcwMDgzMDQ3LCJuYmYiOjE3Njk0NzgyNDd9.s4uE2El4y0EexAKo1GSVM2I9yWOsYC_WIRTRUYH_oy4'),(5,'2026-01-27 09:44:49.473','2026-01-27 09:44:49.473',NULL,'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJJRCI6MSwiVXNlcm5hbWUiOiJhZG1pbiIsIk5pY2tOYW1lIjoi6LaF57qn566h55CG5ZGYIiwiQXV0aG9yaXR5SWQiOiI4ODgiLCJCdWZmZXJUaW1lIjo4NjQwMCwiaXNzIjoiSlktQWRtaW4tUHJvZHVjdGlvbiIsImF1ZCI6WyJHVkEiXSwiZXhwIjoxNzcwMDgzMDY2LCJuYmYiOjE3Njk0NzgyNjZ9.9hamLNgWuk561Lb5xrtec0oWzAGB_DOlUwxilABhC5M'),(6,'2026-01-27 09:45:00.594','2026-01-27 09:45:00.594',NULL,'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJJRCI6MiwiVXNlcm5hbWUiOiJndWVzdCIsIk5pY2tOYW1lIjoi5ri45a6iIiwiQXV0aG9yaXR5SWQiOiI2NjYiLCJCdWZmZXJUaW1lIjo4NjQwMCwiaXNzIjoiSlktQWRtaW4tUHJvZHVjdGlvbiIsImF1ZCI6WyJHVkEiXSwiZXhwIjoxNzcwMDgzMDk2LCJuYmYiOjE3Njk0NzgyOTZ9.wOP1bfpLGSEGTWVGep_1o6YoR8Mlibbi9D5TMP08SPM'),(7,'2026-01-27 09:45:21.785','2026-01-27 09:45:21.785',NULL,'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJJRCI6MSwiVXNlcm5hbWUiOiJhZG1pbiIsIk5pY2tOYW1lIjoi6LaF57qn566h55CG5ZGYIiwiQXV0aG9yaXR5SWQiOiI4ODgiLCJCdWZmZXJUaW1lIjo4NjQwMCwiaXNzIjoiSlktQWRtaW4tUHJvZHVjdGlvbiIsImF1ZCI6WyJHVkEiXSwiZXhwIjoxNzcwMDgzMTA4LCJuYmYiOjE3Njk0NzgzMDh9.3EPuBjfeCnrSsQkWOcTAL6od9AHPfIoKFa0IApv0hDU');
/*!40000 ALTER TABLE `jwt_blacklists` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `sys_authorities`
--

DROP TABLE IF EXISTS `sys_authorities`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sys_authorities` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `created_at` datetime(3) DEFAULT NULL,
  `updated_at` datetime(3) DEFAULT NULL,
  `deleted_at` datetime(3) DEFAULT NULL,
  `authority_id` varchar(191) NOT NULL COMMENT '角色ID',
  `authority_name` longtext COMMENT '角色名',
  `parent_id` longtext COMMENT '父角色ID',
  `default_router` varchar(191) DEFAULT 'dashboard' COMMENT '默认路由',
  `enable` tinyint(1) DEFAULT '1' COMMENT '角色状态，1-启用，0-禁用',
  PRIMARY KEY (`id`,`authority_id`),
  UNIQUE KEY `uni_sys_authorities_authority_id` (`authority_id`),
  KEY `idx_sys_authorities_deleted_at` (`deleted_at`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sys_authorities`
--

LOCK TABLES `sys_authorities` WRITE;
/*!40000 ALTER TABLE `sys_authorities` DISABLE KEYS */;
INSERT INTO `sys_authorities` VALUES (1,'2026-01-21 09:55:02.987','2026-01-21 10:57:43.378',NULL,'888','超级管理员','0','dashboard',1),(2,'2026-01-27 09:42:09.634','2026-01-27 09:44:45.908',NULL,'666','游客','0','dashboard',1);
/*!40000 ALTER TABLE `sys_authorities` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `sys_authority_menus`
--

DROP TABLE IF EXISTS `sys_authority_menus`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sys_authority_menus` (
  `sys_authority_id` bigint unsigned NOT NULL,
  `sys_authority_authority_id` varchar(191) NOT NULL COMMENT '角色ID',
  `sys_base_menu_id` bigint unsigned NOT NULL,
  PRIMARY KEY (`sys_authority_id`,`sys_authority_authority_id`,`sys_base_menu_id`),
  KEY `fk_sys_authority_menus_sys_base_menu` (`sys_base_menu_id`),
  CONSTRAINT `fk_sys_authority_menus_sys_authority` FOREIGN KEY (`sys_authority_id`, `sys_authority_authority_id`) REFERENCES `sys_authorities` (`id`, `authority_id`),
  CONSTRAINT `fk_sys_authority_menus_sys_base_menu` FOREIGN KEY (`sys_base_menu_id`) REFERENCES `sys_base_menus` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sys_authority_menus`
--

LOCK TABLES `sys_authority_menus` WRITE;
/*!40000 ALTER TABLE `sys_authority_menus` DISABLE KEYS */;
INSERT INTO `sys_authority_menus` VALUES (1,'888',1),(2,'666',1),(1,'888',2),(1,'888',3),(1,'888',4),(1,'888',5),(1,'888',6),(1,'888',7),(2,'666',7),(1,'888',8),(2,'666',8),(1,'888',9),(2,'666',9),(1,'888',10),(2,'666',10),(1,'888',11),(2,'666',11),(1,'888',12),(2,'666',12),(1,'888',13),(2,'666',13),(1,'888',14),(2,'666',14),(1,'888',15),(2,'666',15),(1,'888',16),(2,'666',16),(1,'888',17),(2,'666',17),(1,'888',18),(2,'666',18),(1,'888',19),(2,'666',19),(1,'888',20),(2,'666',20),(1,'888',21),(2,'666',21),(1,'888',22),(2,'666',22),(1,'888',23),(2,'666',23),(1,'888',24),(2,'666',24),(1,'888',25),(2,'666',25),(1,'888',26),(2,'666',26),(1,'888',27),(2,'666',27),(1,'888',28),(2,'666',28),(1,'888',29),(2,'666',29),(1,'888',30),(2,'666',30),(1,'888',31),(2,'666',31),(1,'888',32),(2,'666',32),(1,'888',33),(2,'666',33),(1,'888',34),(2,'666',34),(1,'888',35),(2,'666',35),(1,'888',36),(2,'666',36),(1,'888',37),(2,'666',37),(1,'888',38),(2,'666',38),(1,'888',39),(2,'666',39),(1,'888',40),(2,'666',40),(1,'888',41),(2,'666',41),(1,'888',42),(2,'666',42),(1,'888',43),(2,'666',43),(1,'888',44),(2,'666',44),(1,'888',45),(2,'666',45),(1,'888',46),(2,'666',46),(1,'888',47),(2,'666',47),(1,'888',48),(2,'666',48),(1,'888',49),(2,'666',49),(1,'888',50),(2,'666',50),(1,'888',51),(2,'666',51),(1,'888',52),(2,'666',52),(1,'888',53),(2,'666',53),(1,'888',54),(2,'666',54),(1,'888',55),(2,'666',55),(1,'888',56),(2,'666',56),(1,'888',57),(2,'666',57),(1,'888',58),(2,'666',58),(1,'888',59),(2,'666',59),(1,'888',60),(2,'666',60),(1,'888',61),(2,'666',61),(1,'888',62),(2,'666',62),(1,'888',63),(2,'666',63),(1,'888',64),(2,'666',64),(1,'888',65),(2,'666',65),(1,'888',66),(2,'666',66),(1,'888',67),(2,'666',67),(1,'888',68),(2,'666',68);
/*!40000 ALTER TABLE `sys_authority_menus` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `sys_base_menus`
--

DROP TABLE IF EXISTS `sys_base_menus`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sys_base_menus` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `created_at` datetime(3) DEFAULT NULL,
  `updated_at` datetime(3) DEFAULT NULL,
  `deleted_at` datetime(3) DEFAULT NULL,
  `menu_level` bigint unsigned DEFAULT NULL,
  `parent_id` longtext COMMENT '父菜单ID',
  `path` longtext COMMENT '路由path',
  `name` longtext COMMENT '路由name',
  `hidden` tinyint(1) DEFAULT NULL COMMENT '是否在列表隐藏',
  `component` longtext COMMENT '对应前端文件路径',
  `sort` bigint DEFAULT NULL COMMENT '排序标记',
  `enable` tinyint(1) DEFAULT '1' COMMENT '菜单状态，1-启用，0-禁用',
  `title` longtext COMMENT '附加属性',
  `icon` longtext COMMENT '附加属性',
  `close_tab` tinyint(1) DEFAULT NULL COMMENT '附加属性',
  `keep_alive` tinyint(1) DEFAULT NULL COMMENT '附加属性',
  `default_menu` tinyint(1) DEFAULT NULL COMMENT '附加属性',
  PRIMARY KEY (`id`),
  KEY `idx_sys_base_menus_deleted_at` (`deleted_at`)
) ENGINE=InnoDB AUTO_INCREMENT=69 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sys_base_menus`
--

LOCK TABLES `sys_base_menus` WRITE;
/*!40000 ALTER TABLE `sys_base_menus` DISABLE KEYS */;
INSERT INTO `sys_base_menus` VALUES (1,'2026-01-19 09:19:48.835','2026-01-19 14:18:57.179',NULL,0,'0','/home','home',0,'/learning/src/pages/home/index.tsx',0,1,'首页','HomeOutlined',0,0,0),(2,'2026-01-19 09:19:48.847','2026-01-19 11:31:10.812',NULL,0,'0','/system','system',0,'system',9999,1,'系统管理','SettingOutlined',0,0,0),(3,'2026-01-19 09:19:48.855','2026-01-19 09:19:48.855',NULL,0,'2','/user','user',0,'/learning/src/pages/user/index.tsx?t=1768785557312',100,1,'用户管理','',0,0,0),(4,'2026-01-19 09:19:48.863','2026-01-19 09:19:48.863',NULL,0,'2','/authority','authority',0,'/learning/src/pages/authority/index.tsx?t=1768785557312',110,1,'角色管理','',0,0,0),(5,'2026-01-19 09:19:48.869','2026-01-19 09:19:48.869',NULL,0,'2','/menu','menu',0,'/learning/src/pages/menu/index.tsx?t=1768785557312',120,1,'菜单管理','',0,0,0),(6,'2026-01-19 09:19:48.878','2026-01-19 09:19:48.878',NULL,0,'2','/file','file',0,'/learning/src/pages/file/index.tsx?t=1768785557312',130,1,'文件管理','',0,0,0),(7,'2026-01-19 09:19:48.883','2026-01-19 09:19:48.883',NULL,0,'0','/ui','ui',0,'ui',20,1,'UI组件','AppstoreOutlined',0,0,0),(8,'2026-01-19 09:19:48.889','2026-01-19 09:19:48.889',NULL,0,'7','/bezierTabs','bezierTabs',0,'/learning/src/pages/ui/bezierTabs/index.tsx',200,1,'贝塞尔曲线Tabs','',0,0,0),(9,'2026-01-19 09:19:48.898','2026-01-19 09:19:48.898',NULL,0,'7','/auto-height-modal','auto-height-modal',0,'/learning/src/pages/ui/auto-height-modal/index.tsx',210,1,'自适应高度弹窗','',0,0,0),(10,'2026-01-19 09:19:48.906','2026-01-19 09:19:48.906',NULL,0,'7','/treeEditor','treeEditor',0,'/learning/src/pages/ui/treeEditor/index.tsx',220,1,'Tree组件编辑器','',0,0,0),(11,'2026-01-19 09:19:48.916','2026-01-19 09:19:48.916',NULL,0,'7','/cron','cron',0,'/learning/src/pages/ui/cron/index.tsx',230,1,'Cron计时器组件','',0,0,0),(12,'2026-01-19 09:19:48.925','2026-01-19 09:19:48.925',NULL,0,'0','/interaction','interaction',0,'interaction',30,1,'交互功能','InteractionOutlined',0,0,0),(13,'2026-01-19 09:19:48.931','2026-01-19 09:19:48.931',NULL,0,'12','/darg-upload','darg-upload',0,'/learning/src/pages/interaction/darg-upload/index.tsx',300,1,'拖拽上传','',0,0,0),(14,'2026-01-19 09:19:48.937','2026-01-19 09:19:48.937',NULL,0,'12','/drag-list','drag-list',0,'/learning/src/pages/interaction/drag-list/index.tsx',310,1,'拖拽列表','',0,0,0),(15,'2026-01-19 09:19:48.953','2026-01-19 09:19:48.953',NULL,0,'12','/drag-sort','drag-sort',0,'/learning/src/pages/interaction/drag-sort/index.tsx',320,1,'拖拽排序','',0,0,0),(16,'2026-01-19 09:19:48.969','2026-01-19 09:19:48.969',NULL,0,'12','/scroll-horizontal','scroll-horizontal',0,'/learning/src/pages/interaction/scroll-horizontal/index.tsx',330,1,'水平滚动','',0,0,0),(17,'2026-01-19 09:19:48.983','2026-01-19 09:19:48.983',NULL,0,'12','/scrollAndHighlight','scrollAndHighlight',0,'/learning/src/pages/interaction/scrollAndHighlight/index.tsx',340,1,'滚动指定位置高亮','',0,0,0),(18,'2026-01-19 09:19:48.999','2026-01-19 09:19:48.999',NULL,0,'0','/image','image',0,'image',40,1,'图片处理','FileTextOutlined',0,0,0),(19,'2026-01-19 09:19:49.013','2026-01-19 09:19:49.013',NULL,0,'18','/color-thief','color-thief',0,'/learning/src/pages/image/color-thief/index.tsx',400,1,'图片主题色提取','',0,0,0),(20,'2026-01-19 09:19:49.021','2026-01-19 09:19:49.021',NULL,0,'18','/lazyImage','lazyImage',0,'/learning/src/pages/image/lazyImage/index.tsx',410,1,'图片懒加载','',0,0,0),(21,'2026-01-19 09:19:49.030','2026-01-19 09:19:49.030',NULL,0,'18','/preLoad','preLoad',0,'/learning/src/pages/image/preLoad/index.tsx',420,1,'预加载','',0,0,0),(22,'2026-01-19 09:19:49.051','2026-01-19 09:19:49.051',NULL,0,'18','/progressiveImg','progressiveImg',0,'/learning/src/pages/image/progressiveImg/index.tsx',430,1,'渐进式图片加载','',0,0,0),(23,'2026-01-19 09:19:49.061','2026-01-19 09:19:49.061',NULL,0,'0','/data','data',0,'data',50,1,'数据处理','CodeOutlined',0,0,0),(24,'2026-01-19 09:19:49.067','2026-01-19 09:19:49.067',NULL,0,'23','/keyword-high-light','keyword-high-light',0,'/learning/src/pages/data/keyword-high-light/index.tsx',500,1,'关键词高亮算法','',0,0,0),(25,'2026-01-19 09:19:49.076','2026-01-19 09:19:49.076',NULL,0,'23','/string-diff','string-diff',0,'/learning/src/pages/data/string-diff/index.tsx',510,1,'字符串diff比对','',0,0,0),(26,'2026-01-19 09:19:49.086','2026-01-19 09:19:49.086',NULL,0,'23','/export-html','export-html',0,'/learning/src/pages/data/export-html/index.tsx',520,1,'导出html','',0,0,0),(27,'2026-01-19 09:19:49.095','2026-01-19 09:19:49.095',NULL,0,'23','/html-to-image','html-to-image',0,'/learning/src/pages/data/html-to-image/index.tsx',530,1,'html导出为图片','',0,0,0),(28,'2026-01-19 09:19:49.101','2026-01-19 09:19:49.101',NULL,0,'23','/xml-parser','xml-parser',0,'/learning/src/pages/data/xml-parser/index.tsx',540,1,'xml解析渲染','',0,0,0),(29,'2026-01-19 09:19:49.108','2026-01-19 09:19:49.108',NULL,0,'0','/visualization','visualization',0,'visualization',60,1,'可视化','TransactionOutlined',0,0,0),(30,'2026-01-19 09:19:49.114','2026-01-19 09:19:49.114',NULL,0,'29','/canvas-color-analyzer','canvas-color-analyzer',0,'/learning/src/pages/visualization/canvas-color-analyzer/index.tsx',600,1,'canvas颜色分析','',0,0,0),(31,'2026-01-19 09:19:49.132','2026-01-19 09:19:49.132',NULL,0,'29','/canvas-pixelation','canvas-pixelation',0,'/learning/src/pages/visualization/canvas-pixelation/index.tsx',610,1,'canvas像素分析','',0,0,0),(32,'2026-01-19 09:19:49.144','2026-01-19 09:19:49.144',NULL,0,'29','/canvas-watermark','canvas-watermark',0,'/learning/src/pages/visualization/canvas-watermark/index.tsx',620,1,'canvas生成水印','',0,0,0),(33,'2026-01-19 09:19:49.156','2026-01-19 09:19:49.156',NULL,0,'29','/drawSvg','drawSvg',0,'/learning/src/pages/visualization/drawSvg/index.tsx',630,1,'Svg绘画','',0,0,0),(34,'2026-01-19 09:19:49.162','2026-01-19 09:19:49.162',NULL,0,'29','/svgIcon','svgIcon',0,'/learning/src/pages/visualization/svgIcon/index.tsx',640,1,'封装svgIcon','',0,0,0),(35,'2026-01-19 09:19:49.167','2026-01-19 09:19:49.167',NULL,0,'29','/threejs','threejs',0,'/learning/src/pages/visualization/threejs/index.tsx',650,1,'3D渲染','',0,0,0),(36,'2026-01-19 09:19:49.175','2026-01-19 09:19:49.175',NULL,0,'29','/react-flow','react-flow',0,'/learning/src/pages/visualization/react-flow/index.tsx',660,1,'react-flow流程图','',0,0,0),(37,'2026-01-19 09:19:49.180','2026-01-19 09:19:49.180',NULL,0,'0','/editor','editor',0,'editor',70,1,'编辑器','EditOutlined',0,0,0),(38,'2026-01-19 09:19:49.189','2026-01-19 09:19:49.189',NULL,0,'37','/monaco-react','monaco-react',0,'/learning/src/pages/editor/monaco-react/index.tsx',700,1,'monaco编辑器','',0,0,0),(39,'2026-01-19 09:19:49.194','2026-01-19 09:19:49.194',NULL,0,'37','/rich-editor','rich-editor',0,'/learning/src/pages/editor/rich-editor/index.tsx',710,1,'富文本编辑器','',0,0,0),(40,'2026-01-19 09:19:49.201','2026-01-19 09:19:49.201',NULL,0,'37','/audio-editor','audio-editor',0,'/learning/src/pages/editor/audio-editor/index.tsx',720,1,'音频编辑器','',0,0,0),(41,'2026-01-19 09:19:49.209','2026-01-19 09:19:49.209',NULL,0,'0','/document','document',0,'document',80,1,'文档预览','FileTextOutlined',0,0,0),(42,'2026-01-19 09:19:49.215','2026-01-19 09:19:49.215',NULL,0,'41','/pdf-preview','pdf-preview',0,'/learning/src/pages/document/pdf-preview/index.tsx',800,1,'pdf预览','',0,0,0),(43,'2026-01-19 09:19:49.221','2026-01-19 09:19:49.221',NULL,0,'41','/word-preview','word-preview',0,'/learning/src/pages/document/word-preview/index.tsx',810,1,'word预览','',0,0,0),(44,'2026-01-19 09:19:49.228','2026-01-19 09:19:49.228',NULL,0,'0','/library','library',0,'library',90,1,'工具库','ToolOutlined',0,0,0),(45,'2026-01-19 09:19:49.236','2026-01-19 09:19:49.236',NULL,0,'44','/floating-ui','floating-ui',0,'/learning/src/pages/library/floating-ui/index.tsx',900,1,'悬浮','',0,0,0),(46,'2026-01-19 09:19:49.242','2026-01-19 09:19:49.242',NULL,0,'44','/leaflet-map','leaflet-map',0,'/learning/src/pages/library/leaflet-map/index.tsx',910,1,'地图','',0,0,0),(47,'2026-01-19 09:19:49.249','2026-01-19 09:19:49.249',NULL,0,'44','/state','state',0,'/learning/src/pages/library/state/index.tsx',920,1,'状态管理','',0,0,0),(48,'2026-01-19 09:19:49.256','2026-01-19 09:19:49.256',NULL,0,'44','/microapp','microapp',0,'/learning/src/pages/library/microapp/index.tsx',930,1,'微应用','',0,0,0),(49,'2026-01-19 09:19:49.264','2026-01-19 09:19:49.264',NULL,0,'0','/react','react',0,'react',100,1,'React特性','AppleOutlined',0,0,0),(50,'2026-01-19 09:19:49.274','2026-01-19 09:19:49.274',NULL,0,'49','/error-boundary','error-boundary',0,'/learning/src/pages/react/error-boundary/index.tsx',1000,1,'错误边界','',0,0,0),(51,'2026-01-19 09:19:49.286','2026-01-19 09:19:49.286',NULL,0,'49','/notification','notification',0,'/learning/src/pages/react/notification/index.tsx',1010,1,'浏览器级通知','',0,0,0),(52,'2026-01-19 09:19:49.297','2026-01-19 09:19:49.297',NULL,0,'49','/strictMode','strictMode',0,'/learning/src/pages/react/strictMode/index.tsx',1020,1,'严格模式','',0,0,0),(53,'2026-01-19 09:19:49.304','2026-01-19 09:19:49.304',NULL,0,'49','/suspense','suspense',0,'/learning/src/pages/react/suspense/index.tsx',1030,1,'异步组件','',0,0,0),(54,'2026-01-19 09:19:49.313','2026-01-19 09:19:49.313',NULL,0,'49','/useSyncExternalStore','useSyncExternalStore',0,'/learning/src/pages/react/useSyncExternalStore/index.tsx',1040,1,'外部状态监控','',0,0,0),(55,'2026-01-19 09:19:49.319','2026-01-19 09:19:49.319',NULL,0,'0','/style','style',0,'style',110,1,'样式','ChromeOutlined',0,0,0),(56,'2026-01-19 09:19:49.324','2026-01-19 09:19:49.324',NULL,0,'55','/css-filter','css-filter',0,'/learning/src/pages/style/css-filter/index.tsx',1100,1,'cssFilter属性','',0,0,0),(57,'2026-01-19 09:19:49.331','2026-01-19 09:19:49.331',NULL,0,'55','/oracle-font','oracle-font',0,'/learning/src/pages/style/oracle-font/index.tsx',1110,1,'甲骨文字体','',0,0,0),(58,'2026-01-19 09:19:49.340','2026-01-19 09:19:49.340',NULL,0,'0','/devtools','devtools',0,'devtools',120,1,'开发工具','ApiOutlined',0,0,0),(59,'2026-01-19 09:19:49.346','2026-01-19 09:19:49.346',NULL,0,'58','/vite-hmr','vite-hmr',0,'/learning/src/pages/devtools/vite-hmr/index.tsx',1200,1,'Vite热模块（本地）','',0,0,0),(60,'2026-01-19 09:19:49.349','2026-01-19 09:19:49.349',NULL,0,'58','/websocket','websocket',0,'/learning/src/pages/devtools/websocket/index.tsx',1210,1,'实时通信（后端）','',0,0,0),(61,'2026-01-19 09:19:49.354','2026-01-19 09:19:49.354',NULL,0,'0','/game','game',0,'game',130,1,'游戏','PlayCircleOutlined',0,0,0),(62,'2026-01-19 09:19:49.361','2026-01-19 09:19:49.361',NULL,0,'61','/poke','poke',0,'/learning/src/pages/game/poke/index.tsx',1300,1,'扑克游戏','',0,0,0),(63,'2026-01-19 09:19:49.369','2026-01-19 09:19:49.369',NULL,0,'61','/plane-game','plane-game',0,'/learning/src/pages/game/plane-game/index.tsx',1310,1,'飞机大战','',0,0,0),(64,'2026-01-19 09:19:49.375','2026-01-19 09:19:49.375',NULL,0,'0','/other','other',0,'other',140,1,'其他','SearchOutlined',0,0,0),(65,'2026-01-19 09:19:49.383','2026-01-19 09:19:49.383',NULL,0,'64','/resume','resume',0,'/learning/src/pages/other/resume/index.tsx',1400,1,'简历','',0,0,0),(66,'2026-01-19 09:19:49.393','2026-01-19 11:37:33.160',NULL,0,'0','/ai','ai',0,'/learning/src/pages/ai/index.tsx',1,1,'AI对话','OpenAIOutlined',0,0,0),(67,'2026-01-19 09:19:49.402','2026-01-19 11:37:38.385',NULL,0,'0','/about','about',0,'/learning/src/pages/about/index.tsx',2,1,'关于','FileMarkdownOutlined',0,0,0),(68,'2026-01-19 09:19:49.407','2026-01-19 14:46:07.093',NULL,0,'0','/profile','profile',1,'/learning/src/pages/profile/index.tsx?t=1768785557312',170,0,'个人信息','',0,0,0);
/*!40000 ALTER TABLE `sys_base_menus` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `sys_data_authority_id`
--

DROP TABLE IF EXISTS `sys_data_authority_id`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sys_data_authority_id` (
  `sys_authority_id` bigint unsigned NOT NULL,
  `sys_authority_authority_id` varchar(191) NOT NULL COMMENT '角色ID',
  `data_authority_id` bigint unsigned NOT NULL,
  `data_authority_authority_id` varchar(191) NOT NULL COMMENT '角色ID',
  PRIMARY KEY (`sys_authority_id`,`sys_authority_authority_id`,`data_authority_id`,`data_authority_authority_id`),
  KEY `fk_sys_data_authority_id_data_authority` (`data_authority_id`,`data_authority_authority_id`),
  CONSTRAINT `fk_sys_data_authority_id_data_authority` FOREIGN KEY (`data_authority_id`, `data_authority_authority_id`) REFERENCES `sys_authorities` (`id`, `authority_id`),
  CONSTRAINT `fk_sys_data_authority_id_sys_authority` FOREIGN KEY (`sys_authority_id`, `sys_authority_authority_id`) REFERENCES `sys_authorities` (`id`, `authority_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sys_data_authority_id`
--

LOCK TABLES `sys_data_authority_id` WRITE;
/*!40000 ALTER TABLE `sys_data_authority_id` DISABLE KEYS */;
/*!40000 ALTER TABLE `sys_data_authority_id` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `sys_users`
--

DROP TABLE IF EXISTS `sys_users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sys_users` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `created_at` datetime(3) DEFAULT NULL,
  `updated_at` datetime(3) DEFAULT NULL,
  `deleted_at` datetime(3) DEFAULT NULL,
  `username` varchar(191) DEFAULT NULL COMMENT '用户登录名',
  `password` longtext COMMENT '用户登录密码',
  `nick_name` varchar(191) NOT NULL DEFAULT '系统用户' COMMENT '用户昵称',
  `header_img` varchar(191) DEFAULT 'https://qmplusimg.henrongyi.top/gva_header.jpg' COMMENT '用户头像',
  `authority_id` varchar(191) DEFAULT '888' COMMENT '用户角色ID',
  `enable` tinyint(1) DEFAULT '1' COMMENT '用户状态，1-启用，0-禁用',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uni_sys_users_nick_name` (`nick_name`),
  KEY `idx_sys_users_deleted_at` (`deleted_at`),
  KEY `idx_sys_users_username` (`username`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sys_users`
--

LOCK TABLES `sys_users` WRITE;
/*!40000 ALTER TABLE `sys_users` DISABLE KEYS */;
INSERT INTO `sys_users` VALUES (1,'2026-01-21 09:55:09.555','2026-01-27 09:45:19.675',NULL,'admin','$2a$10$hSetXORtf1Ms2Ck2Yea./.xKn2xULGxZHgSD.ggpdH0uxUX9Wj.DO','超级管理员','https://qmplusimg.henrongyi.top/gva_header.jpg','888',1),(2,'2026-01-27 09:41:57.622','2026-01-27 09:43:33.351',NULL,'guest','$2a$10$rqNSb507xD3avPSs1caYceoxkR6eAB8EiIyw2BSuEHLFAIEv7AXO6','游客','https://qmplusimg.henrongyi.top/gva_header.jpg','666',1);
/*!40000 ALTER TABLE `sys_users` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-01-27 10:12:25
